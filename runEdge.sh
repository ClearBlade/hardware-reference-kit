#!/bin/sh

./edge -db=sqlite -sqlite-path=./edge.db -sqlite-path-users=./edgeusers.db -edge-id="RobsMBP" -edge-ip="localhost" -novi-ip="localhost" -edge-cookie="FakeToken" -insecure=true -platform-port="1883" -parent-system="freddy" -log-level=debug -provisioning-mode=true -provisioning-system=a089a6a80bc2add5fbd6b3e7b08101
