#!/bin/bash

echo "Seding files to server"
rsync -arv --exclude-from='exclude_me.txt' -v -e ssh /home/dan/Production/webapps/AutomotiveShield/back-end/.  deploy@10.0.0.201:/home/deploy/mellocloud/automotiveshield/api --delete

echo "Installing node using nvm and installing node modules on remote server"
ssh deploy@10.0.0.201 << 'ENDSSH'
cd mellocloud/automotiveshield/api
nvm install
npm install
pm2 reload autoMotiveShieldApi
ENDSSH