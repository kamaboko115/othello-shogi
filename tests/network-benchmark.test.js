import test from 'node:test';
import assert from 'node:assert/strict';
import {networkBenchmark} from './network-benchmark.mjs';
test('reproducible one-hour / 80-ply model reduces reads and JSON bytes while retaining all peer updates',async()=>{
 const result=await networkBenchmark();assert.equal(result.baseline.reads,1800);assert.equal(result.baseline.writes,40);assert.equal(result.improved.writes,40);
 assert.equal(result.improved.reads-result.improved.unchanged,40);
 assert.ok(result.improved.reads<1200);assert.ok(result.requestReductionPercent>30);assert.ok(result.bodyReductionPercent>90);
});
