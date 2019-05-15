#!/bin/bash

# Pull from github
# mkdir for arch in tmp
# cp clearblade-deployment-kit/* to that dir
# zip 

: '


Prereqs:
cb_console and edge have been released to GitHub

@param {string} $1 VERSION
@param {string} $2 BUILD_ID
@param {string} $3 GOOS
@param {string} $4 GOARCH
@param {string} $5 WORK_DIR
'
assemble(){
	set -e
	VERSION=$1
	BUILD_ID=$2
	GOOS=$3
	GOARCH=$4
	WORK_DIR=$5

	ARTIFACT_FILENAME=cdk-${GOOS}-${GOARCH}.tar.gz
	OUTPUT_DIR=${WORK_DIR}/raw/cdk-${GOOS}-${GOARCH}
	DOWNLOAD_DIR=${WORK_DIR}/download

	REPO_DIR=$GOPATH/src/clearblade-deployment-kit
	ARTIFACTS_DIR=${WORK_DIR}/artifacts
	mkdir -p $OUTPUT_DIR
	cp -r $REPO_DIR/* $OUTPUT_DIR/
	mkdir -p $DOWNLOAD_DIR
	
	# Pull and extract cb_console and edge
	# https://github.com/ClearBlade/Edge/releases/download/4.3.4/edge-darwin-amd64.tar.gz
	FILENAME=edge-$GOOS-$GOARCH.tar.gz
	URL="https://github.com/ClearBlade/Edge/releases/download/$VERSION/$FILENAME"
	cd $DOWNLOAD_DIR
	curl -fsSL $URL -o ${DOWNLOAD_DIR}/${FILENAME}
	tar -xf ${DOWNLOAD_DIR}/${FILENAME} -C $OUTPUT_DIR

	FILENAME=cb_console-$GOOS-$GOARCH.tar.gz
	URL="https://github.com/ClearBlade/cb_console/releases/download/$VERSION/$FILENAME"
	cd $DOWNLOAD_DIR
	# -f returns non-zero exit code if non-200 response code
	curl -fsSL $URL -o ${DOWNLOAD_DIR}/${FILENAME}
	tar -xf ${DOWNLOAD_DIR}/${FILENAME} -C $OUTPUT_DIR

	# Add provision redirect webpage
	cp -r $OUTPUT_DIR/advanced/provision $OUTPUT_DIR/public/
	cd $OUTPUT_DIR
	tar -zcf $ARTIFACTS_DIR/$ARTIFACT_FILENAME $OUTPUT_DIR/*

}