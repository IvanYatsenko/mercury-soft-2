$ErrorActionPreference = 'Stop'
$trialKey = Join-Path $env:USERPROFILE '.ssh\id_ed25519'
$trialPublicKey = (Get-Content -LiteralPath ($trialKey + '.pub') -Raw).Trim()
$trialParts = $trialPublicKey -split '\s+'
if ($trialParts.Length -lt 2 -or $trialParts[0] -ne 'ssh-ed25519' -or $trialParts[1] -notmatch '^[A-Za-z0-9+/=]+$') {
    throw 'Expected an Ed25519 public key'
}
$trialKeyLine = $trialParts[0] + ' ' + $trialParts[1]
foreach ($trialHost in @('10.10.1.167', '10.10.1.88')) {
    Write-Host "Connecting to pi@$trialHost"
    & ssh.exe -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=5 -i $trialKey "pi@$trialHost" true
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'Key access already works'
        continue
    }
    # Only validated public key text is interpolated. Existing keys are preserved.
    $trialCommand = "umask 077; mkdir -p ~/.ssh; chmod 700 ~/.ssh; touch ~/.ssh/authorized_keys; grep -qxF '$trialKeyLine' ~/.ssh/authorized_keys || printf '%s\n' '$trialKeyLine' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
    & ssh.exe -o PubkeyAuthentication=no -o PreferredAuthentications=keyboard-interactive,password -o ConnectTimeout=10 "pi@$trialHost" $trialCommand
    if ($LASTEXITCODE -ne 0) { throw "Could not authorize key on $trialHost" }
    & ssh.exe -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=5 -i $trialKey "pi@$trialHost" true
    if ($LASTEXITCODE -ne 0) { throw "Key verification failed on $trialHost" }
    Write-Host 'Key access verified'
}
Write-Host 'Both ovens are connected. No heating or disk operations were performed.'
