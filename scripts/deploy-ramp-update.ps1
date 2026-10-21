param(
    [string]$DeviceAddress = '10.10.1.167',
    [string]$DeviceUser = 'pi',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\id_ed25519')
)

# Manual maintenance only. This script never starts a heating profile.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$archive = Join-Path ([IO.Path]::GetTempPath()) ('mercury-ramp-' + [guid]::NewGuid() + '.zip')
$sshArguments = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'IdentitiesOnly=yes', '-i', $KeyPath)
$connection = "${DeviceUser}@${DeviceAddress}"

Push-Location $projectRoot
try {
    if (!(Test-Path -LiteralPath $KeyPath)) { throw 'SSH key is missing.' }
    & node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; Raspberry was not modified.' }
    & node --test --test-isolation=none --test-name-pattern 'tracking a rising|quantized virtual ramp|cooling follows|single-phase lamp' apps/server/tests/prototype.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed; Raspberry was not modified.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($relative in @('apps/server/src/thermalRegulator.ts', 'apps/server/dist/thermalRegulator.js')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $projectRoot $relative), $relative) | Out-Null
        }
    } finally { $zip.Dispose() }
    & scp @sshArguments $archive "${connection}:/home/pi/.mercury-ramp-update.zip"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed; running application was not changed.' }

    $remoteScript = @'
import hashlib, json, shutil, subprocess, time, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

root = Path('/home/pi/mercury-v3')
archive = Path('/home/pi/.mercury-ramp-update.zip')
files = ['apps/server/src/thermalRegulator.ts', 'apps/server/dist/thermalRegulator.js']

def api(path, method=None):
    request = urllib.request.Request('http://127.0.0.1:3001/api/' + path, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)

def service(action):
    subprocess.run(['systemctl', '--user', action, 'mercury-v3'], check=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

with zipfile.ZipFile(archive) as bundle:
    assert sorted(bundle.namelist()) == sorted(files), 'Unexpected update files'
    assert bundle.testzip() is None, 'Corrupt update archive'
    payload = {name: bundle.read(name) for name in files}

run = api('run')
assert run['state'] in ('idle', 'stopped', 'completed', 'failed'), 'An active profile must be stopped by the operator first'
if run.get('holdingTemperatureC') is not None:
    print('Stopping temperature hold; cooling remains controlled by the current server.', flush=True)
    api('run/stop', 'POST')

deadline = time.monotonic() + 1800
while True:
    run = api('run')
    assert run['state'] in ('idle', 'stopped', 'completed', 'failed') and run.get('holdingTemperatureC') is None, 'Control changed; aborting update'
    board = api('controller/check')
    assert board.get('ready'), 'Controller is not ready; aborting update'
    telemetry = board['telemetry']
    assert telemetry.get('heaters') is False and telemetry.get('lamps') is False, 'Heat is not confirmed off'
    temperatures = [telemetry.get('chamberTemperatureC'), telemetry.get('boardTemperatureC')]
    assert all(isinstance(t, (int, float)) and 0 <= t < 280 for t in temperatures), 'Invalid temperature'
    print('Cooling: chamber=%s board=%s' % tuple(temperatures), flush=True)
    if max(temperatures) <= 50:
        break
    assert time.monotonic() < deadline, 'Cooling timeout; current application remains installed'
    time.sleep(15)

stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = root.parent / ('mercury-before-ramp-' + stamp)
backup.mkdir()
preserved = {name: digest(root / name) for name in ('config.json', '.env')}
service('stop')
try:
    for name in files:
        target = root / name
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
    for name, data in payload.items():
        target = root / name
        temporary = target.with_suffix(target.suffix + '.next')
        temporary.write_bytes(data)
        temporary.replace(target)
    service('start')
    for attempt in range(30):
        try:
            api('health')
            break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError('Updated server did not start')
except Exception:
    service('stop')
    for name in files:
        saved = backup / name
        if saved.is_file():
            shutil.copy2(saved, root / name)
    service('start')
    raise

assert all(digest(root / name) == value for name, value in preserved.items()), 'Configuration changed during update; inspect before running'
assert all((root / name).read_bytes() == value for name, value in payload.items()), 'Installed code mismatch'
run = api('run')
assert run['state'] == 'idle' and run.get('holdingTemperatureC') is None, 'Unexpected state after update'
for attempt in range(15):
    board = api('controller/check')
    if board.get('ready'):
        break
    time.sleep(1)
assert board.get('ready'), 'Application started but controller is not ready'
assert board['telemetry'].get('heaters') is False and board['telemetry'].get('lamps') is False, 'Heat is not confirmed off after update'
print(json.dumps({'installed': files, 'backup': str(backup), 'run': run, 'thermal': api('settings/thermal'), 'board': board}, ensure_ascii=False), flush=True)
archive.unlink()
print('Update installed. No profile or temperature hold was started.', flush=True)
'@
    $remoteScript | & ssh @sshArguments $connection 'python3 -'
    if ($LASTEXITCODE -ne 0) { throw 'Update did not finish. Read the preceding output before retrying.' }
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
}
