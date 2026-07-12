#!/usr/bin/env bash
set -euo pipefail

# one-time server provisioning for loci — run as root on a fresh debian/ubuntu host

APP_DIR=/opt/loci

apt-get update
apt-get install -y ca-certificates curl git jq ufw unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p "$APP_DIR" "$APP_DIR/backups"

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
usermod -aG docker deploy

if [ -f /root/.ssh/authorized_keys ] && [ ! -f /home/deploy/.ssh/authorized_keys ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi

chown -R deploy:deploy "$APP_DIR"

cat > /etc/sysctl.d/99-loci.conf <<'EOF'
vm.overcommit_memory=1
vm.swappiness=10
net.core.somaxconn=4096
fs.file-max=2097152
EOF
sysctl --system >/dev/null

if ! swapon --show --noheadings | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

cat > /etc/ssh/sshd_config.d/99-loci.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

systemctl enable --now unattended-upgrades

if [ ! -d "$APP_DIR/repo/.git" ]; then
  echo "clone the repo into $APP_DIR/repo as deploy, copy .env.example to .env, fill it, chmod 600, then run deploy/deploy.sh"
fi

echo "server setup complete"
