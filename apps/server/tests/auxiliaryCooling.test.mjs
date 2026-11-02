import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coolingDemand, controllerTemperature, controllerFanValues } from '../dist/coolingDemand.js';

test('cooling hysteresis preserves the old 50/40 and 60/50 thresholds and fails on', () => {
  for (const [on, off] of [[50,40],[60,50]]) {
    assert.equal(coolingDemand(on + 1, false, on, off), true);
    assert.equal(coolingDemand(off + 1, true, on, off), true);
    assert.equal(coolingDemand(on, false, on, off), false);
    assert.equal(coolingDemand(off, true, on, off), true);
    assert.equal(coolingDemand(off - 1, true, on, off), false);
    assert.equal(coolingDemand(null, false, on, off), true);
    assert.equal(coolingDemand(NaN, false, on, off), true);
  }
});
test('controller temperature uses internal sensor, including old /32 protocol, not chamber or PCB thermocouples', () => {
  assert.equal(controllerTemperature([51, 1000, 800], 2), 51);
  assert.equal(controllerTemperature([51*32, 1000, 800], 1), 51);
  assert.equal(controllerTemperature([51*32], 0), 51);
  assert.equal(controllerTemperature([], 2), null);
});
test('fan writes preserve buzzer, lights and second LV fan for 6 and 8 outputs', () => {
  for (const original of [[1,0,1,1,1,0],[1,0,1,1,1,0,1,1]]) {
    const values = controllerFanValues(original, true);
    assert.equal(values[5], 1);
    assert.deepEqual(values.filter((_,i)=>i!==5), original.filter((_,i)=>i!==5));
    assert.equal(original[5],0);
  }
  assert.throws(()=>controllerFanValues([0,0,0],true));
});

test('virtual controller cooling is automatic and manual pulses restore demand without touching HV', async () => {
  const dir = await mkdtemp(join(tmpdir(),'mercury-aux-'));
  process.env.MERCURY_CONTROLLER_MODE='simulation';
  process.env.MERCURY_CONFIG_PATH=join(dir,'config.json');
  process.env.MERCURY_LOG_USB_MOUNT=join(dir,'no-usb');
  await writeFile(process.env.MERCURY_CONFIG_PATH,JSON.stringify({ovenModel:'300',connectionVoltage:'230'}));
  const { virtualBoard } = await import('../dist/controller/virtualBoard.js');
  const controller = await import('../dist/controller/checkControllerConnection.js');
  try {
    await controller.initializeControllerConnection();
    for (const [temperature,expected] of [[51,true],[45,true],[39,false],[45,false]]) {
      virtualBoard.setControllerTemperature(temperature);
      await controller.checkControllerConnection();
      assert.equal(controller.controllerCoolingStatus().enabled,expected);
    }
    const hv = virtualBoard.snapshot().highVoltageOutputs;
    const pulse = controller.testOvenElement('controllerCooling');
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(controller.controllerCoolingStatus().enabled,true);
    assert.equal((await pulse).success,true);
    assert.equal(controller.controllerCoolingStatus().enabled,false);
    virtualBoard.setControllerTemperature(55);
    assert.equal((await controller.testOvenElement('controllerCooling')).success,true);
    assert.equal(controller.controllerCoolingStatus().enabled,true);
    assert.deepEqual(virtualBoard.snapshot().highVoltageOutputs,hv);
    controller.setProfileControl(true);
    assert.equal((await controller.testOvenElement('controllerCooling')).success,false);
  } finally {controller.setProfileControl(false); await rm(dir,{recursive:true,force:true});}
});
