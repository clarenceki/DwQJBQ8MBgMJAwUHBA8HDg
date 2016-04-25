## What do I do?
---

* Get a job from beanstalk server with the following format.
```
{
	'from': 'HKD',
	'to': 'USD'
}
```
* Get the HTML file from xe.com every 60 seconds
* Parse the HTML and store the currency rate to MongoDB with the following format.
```
{
    "from": "HKD",
    "to": "USD",
    "created_at": new Date(1347772629876),
    "rate": "0.13"
}
```
* Save 10 successful rate results to MongoDB, then the job is done
* Bury the job if more than 3 times in total (not consecutive)

## How to run consumer worker
----

1. Open 'consumer.js' and fill in the beanstalk server and MongoDB server settings 
```
let options = {
    parallel: 10, // number of tasks running in "parallel"
    bs_host: 'localhost', // the ip/host of the beanstalk server
    bs_port: 11300, // the port number of the beanstalk server
    bs_tube: 'clarenceki', // the tube name
    // the standard MongoDB URL
    // format : mongodb://<dbuser>:<dbpassword>@<host>:<port>/<database>
    mongodb_uri: 'mongodb://dbuser:dbpassword@host:13991/database',
    mongodb_collection: 'xe_currency', // the collection name on MongoDB
    failed_delay: 3, // delay in seconds if failed attempt
    failed_attempt: 3, // allow the number of failed attempt before the job is buried
    success_delay: 60, // delay in seconds if success attempt
    success_attempt: 10 // number of successful rate results to be saved
};
```
2. Run 'npm install' to install all deps locally.
3. Run 'node consumer.js'.

## How to produce a job
----

1. Open 'producer.js' and fill in the beanstalk server setting
```
const host = 'localhost';
const port = 11300;
const tube = 'clarenceki';
```
2. Run 'node producer.js `FROM` `TO`', `FROM` and `TO` are ISO 4217 currency code.
	e.g.: 'node producer.js HKD USD'
