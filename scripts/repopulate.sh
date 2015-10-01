#!/bin/bash

set -e

if [ -z $1 ]
then
  echo "Usage: $0 <worker_id>"
  exit 1
fi

curl -XPOST "http://localhost:4002/workers/$1/repopulate"
