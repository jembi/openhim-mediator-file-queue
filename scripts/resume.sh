#!/bin/bash

set -e

if [ -z $1 ]
then
  echo "Usage: $0 <worker-name>"
  exit 1
fi

curl -XPUT -H "Content-Type: application/json" -d "{\"paused\": false}" "http://localhost:4002/workers/$1"
