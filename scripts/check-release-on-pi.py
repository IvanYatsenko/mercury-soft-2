"""Read-only with respect to the installed program/controller; test files in /tmp."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import shutil
import subprocess
import tarfile
import tempfile

archive = Path('/home/pi/mercury-release-check-3.0.0.tar.gz')
stage = Path(tempfile.mkdtemp(prefix='mercury-release-check-', dir='/tmp'))
try:
    with tarfile.open(archive) as tar:
        for m in tar:
            assert m.name.startswith('mercury-v2/') and '..' not in PurePosixPath(m.name).parts
            if m.issym() or m.islnk():
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(m.name), m.linkname)) if m.issym() else m.linkname
                assert resolved.startswith('mercury-v2/') and not posixpath.isabs(m.linkname)
    subprocess.run(['tar', '-xzf', str(archive), '-C', str(stage)], check=True)
    package = stage / 'mercury-v2'
    program = package / 'program'
    node = package / 'runtime/bin/node'
    version = subprocess.check_output([str(node), '--version'], text=True).strip()
    assert version.startswith('v24.')
    electron = program / 'apps/panel/node_modules/electron/dist/electron'
    for binary in (node, electron):
        result = subprocess.run(['ldd', str(binary)], capture_output=True, text=True, check=True)
        assert 'not found' not in result.stdout + result.stderr, result.stdout
    env = dict(os.environ, MERCURY_CONTROLLER_MODE='simulation', MERCURY_API_PORT='33991',
               MERCURY_LOG_USB_MOUNT=str(stage / 'unmounted'),
               MERCURY_CONFIG_PATH=str(stage / 'data/config.json'),
               MERCURY_DATABASE_PATH=str(stage / 'data/profiles.sqlite'))
    def run(script, *args):
        return subprocess.check_output([str(node), script, *args], cwd=program, env=env, text=True, stderr=subprocess.STDOUT)
    run('release/migrate-v2.mjs')
    assert not Path(env['MERCURY_CONFIG_PATH']).exists(), 'Archive must not choose device model or voltage'
    result = run('--input-type=module', '-e', '''
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(new URL('./apps/server/package.json', 'file://'+process.cwd()+'/'));
require('express'); require('itmp'); require('itmplinkserial');
const settings=await import('./apps/server/dist/ovenSettings.js');
const db=await import('./apps/server/dist/database.js');
assert.equal(settings.readOvenSelection(),null);
assert.ok(db.listProfiles().some(p=>p.name==='Свинцовая паста'));
await settings.saveOvenSelection({ovenModel:'300',connectionVoltage:'230'});
assert.equal(settings.readThermalSettings().powersW.infrared,2600);
await settings.saveOvenSelection({ovenModel:'400',connectionVoltage:'380'});
assert.equal(settings.readThermalSettings().powersW.infrared3,3600);
console.log(JSON.stringify({profiles:db.listProfiles().length,selection:settings.readOvenSelection()}));
process.exit(0);
''')
    before = Path(env['MERCURY_CONFIG_PATH']).read_bytes()
    run('release/migrate-v2.mjs')
    assert Path(env['MERCURY_CONFIG_PATH']).read_bytes() == before
    print(json.dumps({'node': version, 'sharedLibraries': 'OK', 'nativeDependencies': 'OK',
                      'firstSetup': 'model and voltage unset', 'migrationAndSelection': result.strip(),
                      'configPreserved': True, 'controllerAccessed': False}), flush=True)
finally:
    assert stage.resolve().parent == Path('/tmp') and stage.name.startswith('mercury-release-check-')
    shutil.rmtree(stage)
