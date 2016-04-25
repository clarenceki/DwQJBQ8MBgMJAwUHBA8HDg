'use strict';
let expect = require('chai').expect;
let consumer = require('../consumer.js');

describe('Testing http request', function () {
	describe('Input validation', function () {
		let tests = [
			{args: {}, expect: 'Input information is not completed.'},
			{args: {job: {}}, expect: 'Input information is not completed.'},
			{args: {job: {payload: {}}}, expect: 'The currency code is not valid.'},
			{args: {job: {payload: {from: 'HK'}}}, expect: 'The currency code is not valid.'},
			{args: {job: {payload: {from: 'HKD'}}}, expect: 'The currency code is not valid.'},
			{args: {job: {payload: {from: 'HKD', to: 'US'}}}, expect: 'The currency code is not valid.'}
		];

		tests.forEach(function (t) {
			it('should return error : ' + t.expect, function () {
				return consumer.promiseRequest(t.args)
				.then(function (data) {
					expect(data.error).to.not.equal('');
				}, function (data) {
					expect(data.error).to.equal(t.expect);
				});
			});
		});
	});

	describe('HTML parser', function () {
		it('should return HTML contained the currency rate information', function () {
			return consumer.promiseRequest({job: {payload: {from: 'USD', to: 'EUR'}}})
			.then(consumer.promiseParser)
			.then(function (data) {
				expect(data.job.html).to.not.equal('');
				expect(data.job.result.rate).to.not.equal('');
			}, function (data) {
				expect(data.error).to.equal('');
			});
		});
		it('should return HTML dose no contained the currency rate information', function () {
			return consumer.promiseRequest({job: {payload: {from: 'USD', to: 'ABC'}}})
			.then(function (data) {
				expect(data.job.html).to.not.equal(undefined);
				let re = /1&nbsp;(\S{3})&nbsp;=&nbsp;([\d.,]+)&nbsp;(\S{3})/i;
				let found = data.job.html.match(re);
				expect(found).to.equal(null);
			}, function (data) {
				expect(data.error).to.equal('');
			});
		});
	});
});
