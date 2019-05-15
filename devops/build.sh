#!/bin/bash
set -xe
source $GOPATH/src/clearblade-deployment-kit/devops/assemble_binaries.sh

VERSION=$1
BUILD_ID=$2
WORK_DIR=$3

assemble $VERSION $BUILD_ID darwin amd64 $WORK_DIR