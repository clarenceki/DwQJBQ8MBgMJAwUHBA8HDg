'use strict';

const fivebeans = require('fivebeans');

const host = 'localhost';
const port = 11300;
const tube = 'clarenceki';

let job = {'from': 'HKD', 'to': 'USD'};

process.argv.forEach((val, index, array) => {
	if (index === 2) {
		job.from = val;
	}
	if (index === 3) {
		job.to = val;
	}
});

let client = new fivebeans.client(host, port);
client.on('connect', function () {
	console.log('Connected to beanstalk server at ' + host + ':' + port);
	client.use(tube, function (err1, tname) {
		if (err1) {
			console.error('Error : ' + err1);
			client.end();
			process.exit(0);
		}
		console.log('Using tube ' + tname);
		client.put(0, 0, 60, JSON.stringify(job), function (err2, jobid) {
			if (err2) {
				console.error('Error : ' + err2);
				client.end();
				process.exit(0);
			}
			console.log('Queued a string reverse job in ' + tube + ' : ' + jobid);
			client.end();
			process.exit(0);
		});
	});
});

client.connect();
