#!/bin/sh

# edge -db=sqlite -sqlite-path=./edge.db -sqlite-path-users=./edgeusers.db -edge-id="unprovisioned" -edge-ip="localhost" -novi-ip="localhost" -edge-cookie="null" -platform-port="1883" -parent-system="null" -log-level=debug -provisioning-mode=true -provisioning-system=f8969acd0b92de96f69dfa92e09801
./edge -config=./edgecfg.toml
