#!/bin/sh
cd /opt/iotagent-sigfox/

CONFIG_FILE=${1:-'config.json'}

npm start ${CONFIG_FILE}
