'use strict';
let expect = require('chai').expect;
let consumer = require('../consumer.js');

describe('Testing HTML parser', function () {
	describe('Input validation', function () {
		let tests = [
			{args: {}, expect: 'No HTML input.'},
			{args: {job: {}}, expect: 'No HTML input.'},
			{args: {job: {abc: 'def'}}, expect: 'No HTML input.'},
			{args: {job: {html: ''}}, expect: 'Cannot parse currency rate from HTML.'}
		];

		tests.forEach(function (t) {
			it('should return error : ' + t.expect, function () {
				return consumer.promiseParser(t.args)
				.then(function (data) {
					expect(data).to.equal(null);
				}, function (data) {
					expect(data.error).to.equal(t.expect);
				});
			});
		});
	});

	describe('HTML parser', function () {
		let tests = [
			{args: {job: {html: '1&nbsp;USD&nbsp;=&nbsp;0.895936&nbsp;EUR', payload: {from: 'USD', to: 'EUR'}}}, rate: '0.90'},
			{args: {job: {html: '1&nbsp;USD&nbsp;=&nbsp;22,294.98&nbsp;VND', payload: {from: 'USD', to: 'VND'}}}, rate: '22294.98'}
		];

		tests.forEach(function (t) {
			it('should return currency rate of ' + t.rate + ' for ' + t.args.job.payload.from + ' to ' + t.args.job.payload.to, function () {
				return consumer.promiseParser(t.args)
				.then(function (data) {
					expect(data.job.result.from).to.equal(t.args.job.payload.from);
					expect(data.job.result.to).to.equal(t.args.job.payload.to);
					expect(data.job.result.rate).to.equal(t.rate);
				}, function (data) {
					expect(data.error).to.equal('');
				});
			});
		});

		it('should return error : Requested currency code is not match responsed currency code', function () {
			return consumer.promiseParser({job: {html: '1&nbsp;USD&nbsp;=&nbsp;22,294.98&nbsp;VND', payload: {from: 'VND', to: 'USD'}}})
			.then(function (data) {
				expect(data.error).to.not.equal('');
			}, function (data) {
				expect(data.error).to.equal('Requested currency code is not match responsed currency code.');
			});
		});
		it('should return error : Cannot parse currency rate from HTML', function () {
			return consumer.promiseParser({job: {html: 'xx'}})
			.then(function (data) {
				expect(data.error).to.not.equal('');
			}, function (data) {
				expect(data.error).to.equal('Cannot parse currency rate from HTML.');
			});
		});
	});
});
