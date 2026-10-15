import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceOf,totalOf,escapeHtml,safeImage} from '../src/domain.js';
test('discounted totals use sale prices and quantities',()=>{const p=[{id:'a',price:100,sale_price:80},{id:'b',price:50,sale_price:null}];assert.equal(totalOf([{id:'a',quantity:2},{id:'b',quantity:3}],p),310);assert.equal(priceOf({price:100,sale_price:120}),100);});
test('stale products and invalid quantities cannot produce totals',()=>{assert.throws(()=>totalOf([{id:'missing',quantity:1}],[]));assert.throws(()=>totalOf([{id:'a',quantity:-1}],[{id:'a',price:100}]));});
test('untrusted content is escaped and image protocols restricted',()=>{assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');assert.equal(safeImage('javascript:alert(1)'),'');assert.equal(safeImage('https://example.com/a.png'),'https://example.com/a.png');});
