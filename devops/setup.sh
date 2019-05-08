#!/bin/bash

LOGFILE="setup_log"

if [ -f $LOGFILE ] ; then
	rm $LOGFILE
	echo "Removed existing $LOGFILE file"
fi

NUMBER_OF_DB_FILES=`ls -1 *.db 2>/dev/null | wc -l`

if [ $NUMBER_OF_DB_FILES != 0 ]; then
	rm *.db
	echo "Removed old sqlite files"
fi

pgrep edge > /dev/null 2>/dev/null && pkill edge

echo "Copy base edge db files into working directory"

tar -xvf baseedgedbs.tar.gz

echo "Starting edge"

edge -config=./baseedgeconfig.toml > $LOGFILE 2>/dev/null &

echo "Started edge to get sqlite files"

# Wait until edge prints out the classic "We have inited and are about to start the router" message
while ! grep "We have inited" $LOGFILE; do
	:
done

echo "Edge has been inited"

echo "Changing directories"

cd ../ClearBladeDeploymentKit

echo "Targeting edge"
cb-cli target -url=http://localhost:9005 -messaging-url=localhost:1885 -email=admin@clearblade.com -password=ClearBladeDeploymentKit -system-key=f8969acd0b92de96f69dfa92e09801
echo "Pushing deployment kit system to edge"
# seed the edge dbs with the deployment kit system
cb-cli push -all -auto-approve

echo "Pushed assets to edge"

pgrep edge > /dev/null 2>/dev/null && pkill edge

echo "Killed edge"

# todo: grab edge db files
