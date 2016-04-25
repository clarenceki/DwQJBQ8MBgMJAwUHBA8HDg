'use strict';
const co = require('co');
const promise = require('bluebird');
const fivebeans = require('fivebeans');
const http = require('http');
const MongoClient = require('mongodb').MongoClient;

let options = {
	parallel: 10, // number of tasks running in "parallel"
	bs_host: 'localhost', // the ip/host of the beanstalk server
	bs_port: 11300, // the port number of the beanstalk server
	bs_tube: 'clarenceki', // the tube name
	// the standard MongoDB URL
	// format : mongodb://<dbuser>:<dbpassword>@<host>:<port>/<database>
//	mongodb_uri: 'mongodb://dbuser:dbpassword@host:13991/database',
	mongodb_uri: 'mongodb://DwcNBAwGAwYHDQwJBAwBCA:DwcNBAwGAwYHDQwJBAwBCA@ds013991.mlab.com:13991/my-first-db',
	mongodb_collection: 'xe_currency', // the collection name on MongoDB
	failed_delay: 3, // delay in seconds if failed attempt
	failed_attempt: 3, // allow the number of failed attempt before the job is buried
	success_delay: 60, // delay in seconds if success attempt
	success_attempt: 10 // number of successful rate results to be saved
};

/**
 * Check if an object is empty
 *
 * @param {object} obj - The object to be checked
 */
function isEmptyObject(obj) {
	return !Object.keys(obj).length;
}

/**
 * Connect to MongoDB
 *
 * @param {object} opt - The options parameters
 * @param {string} opt.mongodb_uri - The standard MongoDB URL
 */
let promiseMongoConnect = promise.method(function (opt) {
	return new Promise(function (resolve, reject) {
		MongoClient.connect(opt.mongodb_uri, function (err, db) {
			if (err) {
				reject('Cannot connect to MongoDB. ' + err);
			}
			// console.log('Connected correctly to MongoDB server.');
			resolve(db);
		});
	});
});

/**
 * Save document to MongoDB
 *
 * @param {object} info - The object to store everything
 * @param {object} info.db - The MongoDB connection handler
 * @param {string} info.options.mongodb_collection - The collection on MongoDB
 * @param {object} info.job.result - The currency rate result to be saved to MongoDB
 */
let promiseMongoUpdate = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		let collection = info.db.collection(info.options.mongodb_collection);
		// append the create_at field to the result
		info.job.result.create_at = new Date();
		collection.save(info.job.result, function (err, r) {
			if (err) {
				info.error = 'Cannot save document to MongoDB. ' + err;
				reject(info);
			}
			resolve(info);
		});
	});
});

/**
 * Connect to beanstalk server
 *
 * @param {object} opt - The options parameters
 * @param {string} opt.bs_host - The IP/host of the beanstalk server
 * @param {number} opt.bs_port - The port number of the beanstalk server
 * @param {string} opt.bs_tube - The tube name
 */
let promiseBeansConnect = promise.method(function (opt) {
	return new Promise(function (resolve, reject) {
		let client = new fivebeans.client(opt.bs_host, opt.bs_port);
		client.on('connect', function () {
			// console.log('Connected to beanstalkd at ' + opt.bs_host + ':' + opt.bs_port);
			// watch the tube for new job
			client.watch(opt.bs_tube, function (err) {
				if (err) {
					reject('Error on watching tube. ' + err);
				}
				resolve(client);
			});
			// set the tube name for job reput
			client.use(opt.bs_tube, function (err, tname) {
				if (err) {
					reject('Error on using tube. ' + err);
				}
				resolve(client);
			});
		});
		client.on('error', function (err) {
			reject('Beanstalkd connection error : ' + err);
		});
		client.on('close', function () {
			reject('Beanstalkd connection closed.');
		});

		client.connect();
	});
});

/**
 * Try to reserve a job from beanstalk server
 *
 * @param {object} info - The object to store everything
 * @param {object} info.bs - The beanstalk connection handler
 */
let promiseBeansReserve = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		info.bs.reserve(function (err, jobid, payload) {
			if (err) {
				info.error = 'Error on reserving job. ' + err;
				reject(info);
			}
			let json = JSON.parse(payload);
			// add entry to store the number of success attempted
			if (!json.success_attempt) {
				json.success_attempt = 0;
			}
			// add entry to store the number of failed attempted
			if (!json.failed_attempt) {
				json.failed_attempt = 0;
			}
			info.job = {id: jobid, payload: json};
			resolve(info);
		});
	});
});

/**
 * Manage job on beanstalk when success attempt
 *
 * @param {object} info - The object to store everything
 * @param {object} info.job.payload - The job payload
 * @param {number} info.job.payload.success_attempt - The number of success attempted of this job
 * @param {number} info.job.id - The id of current job
 * @param {object} info.options - The options parameters
 * @param {number} info.options.success_attempt - The total required number of successful rate results to be saved
 * @param {number} info.options.success_delay - The delay in seconds if success attempt
 */
let promiseBeansHandleResolve = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		// console.log(info.job.result);
		// update the success attempt counter
		info.job.payload.success_attempt ++;
		if (info.job.payload.success_attempt < info.options.success_attempt) {
			// the job has not finished yet, reput this job
			info.bs.put(0, info.options.success_delay, 60, JSON.stringify(info.job.payload), function (err, jobid) {
				info.bs.destroy(info.job.id, function (error) {
					resolve(info);
				});
			});
		} else {
			// the job is done
			info.bs.destroy(info.job.id, function (error) {
				resolve(info);
			});
		}
	});
});

/**
 * Manage job on beanstalk when failed attempt
 *
 * @param {object} info - The object to store everything
 * @param {object} info.job.payload - The job payload
 * @param {number} info.job.payload.failed_attempt - The number of failed attempted of this job
 * @param {number} info.job.id - The id of current job
 * @param {object} info.options - The options parameters
 * @param {number} info.options.failed_attempt - The number of failed attempt before the job is buried
 * @param {number} info.options.failed_delay - The delay in seconds if failed attempt
 */
let promiseBeansHandleReject = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		console.error(info.error);
		// update the failed attempt counter
		info.job.payload.failed_attempt ++;
		if (info.job.payload.failed_attempt < info.options.failed_attempt) {
			// failed attempt, but can try again with shorter delay
			info.bs.put(0, info.options.failed_delay, 60, JSON.stringify(info.job.payload), function (err, jobid) {
				info.bs.destroy(info.job.id, function (error) {
					resolve(info);
				});
			});
		} else {
			// failt too many time, bury the job
			info.bs.bury(info.job.id, 0, function (error) {
				resolve(info);
			});
		}
	});
});

/**
 * Fetch HTML from www.xe.com
 *
 * @param {object} info - The object to store everything
 * @param {object} info.job.payload - The job payload
 * @param {string} info.job.payload.from - The from currency code
 * @param {string} info.job.payload.to - The to currency code
 */
let promiseRequest = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		if (isEmptyObject(info) || isEmptyObject(info.job) || isEmptyObject(info.job.payload)) {
			info.error = 'Input information is not completed.';
			reject(info);
		}
		if (!info.job.payload.from || info.job.payload.from.length !== 3) {
			info.error = 'The currency code is not valid.';
			reject(info);
		}
		if (!info.job.payload.to || info.job.payload.to.length !== 3) {
			info.error = 'The currency code is not valid.';
			reject(info);
		}
		let opt = {
			method: 'GET',
			host: 'www.xe.com',
			port: 80,
			path: '/currencyconverter/convert/?Amount=1&From=' + info.job.payload.from + '&To=' + info.job.payload.to
		};
		let request = http.request(opt, function (response) {
			let html = '';
			response.on('data', function (chunk) {
				html += chunk;
			});
			response.on('end', function () {
				info.job.html = html;
				resolve(info);
			});
		});
		request.on('socket', function (socket) {
			// set the timeout of the socket to 10 seconds
			socket.setTimeout(10000);
			socket.on('timeout', function () {
				request.abort();
				info.error = 'Fetch HTML timeout.';
				reject(info);
			});
		});
		request.on('error', function (error) {
			info.error = 'Fetch HTML error. ' + error;
			reject(info);
		});
		request.end();
	});
});

/**
 * Extra the currency rate from raw HTML
 *
 * @param {object} info - The object to store everything
 * @param {string} info.job.html - The raw HTML from www.xe.com
 */
let promiseParser = promise.method(function (info) {
	return new Promise(function (resolve, reject) {
		if (isEmptyObject(info) || isEmptyObject(info.job) || !info.job.html) {
			info.error = 'No HTML input.';
			reject(info);
		}
		let re = /1&nbsp;(\S{3})&nbsp;=&nbsp;([\d.,]+)&nbsp;(\S{3})/i;
		let found = info.job.html.match(re);
		if (found) {
			if (found[1] !== info.job.payload.from || found[3] !== info.job.payload.to) {
				info.error = 'Requested currency code is not match responsed currency code.';
				reject(info);
			}
			info.job.result = {
				'from': found[1],
				'to': found[3],
				'rate': parseFloat(found[2].replace(',', '')).toFixed(2) // round off to 2 decmicals in STRING type
			};
			resolve(info);
		} else {
			info.error = 'Cannot parse currency rate from HTML.';
			reject(info);
		}
	});
});

/**
 * Run a single task
 *
 * @param {object} opt - The options parameters
 * @param {object} db - The MongoDB connection handler
 */
function* doTask(opt, db) {
	let bs = yield promiseBeansConnect(opt);

	// we are using generator, using forever loop should be fine, right?
	for (;;) {
		yield promiseBeansReserve({bs: bs, db: db, options: opt})
		.then(promiseRequest)
		.then(promiseParser)
		.then(promiseMongoUpdate)
		.then(promiseBeansHandleResolve, promiseBeansHandleReject);
	}
}

co(function* () {
	try {
		// try to connect to MongoDB
		// fail to connect will cause this program terminated
		let db = yield promiseMongoConnect(options);
		let task = [];
		// create multiple task to run in "parallel"
		for (let i = 0; i < options.parallel; i++) {
			task[i] = doTask(options, db);
		}
		yield task;
	} catch (error) {
		console.error(error);
	}
});

exports.promiseMongoConnect = promiseMongoConnect;
exports.promiseMongoEnd = function (db) {db.close();};
exports.promiseBeansConnect = promiseBeansConnect;
exports.promiseBeansEnd = function (bs) {bs.end();};
exports.promiseRequest = promiseRequest;
exports.promiseParser = promiseParser;
exports.promiseMongoUpdate = promiseMongoUpdate;
exports.promiseBeansHandleResolve = promiseBeansHandleResolve;
exports.promiseBeansHandleReject = promiseBeansHandleReject;
