# ClearBlade Development Kit

## Overview

ClearBlade Development Kit (CDK) provides an out-of-the-box application for deploying ClearBlade's Edge Computing Platform.

## Prereqs

`ClearBlade Platform System` - A system created in a ClearBlade Platform, such as platform.clearblade.com
`Clearblade Edge System` - A system running on a particular Edge

You must have a `ClearBlade Platform System` to which to attach this Edge.

## Setup

1. Download the latest release here: https://github.com/ClearBlade/clearblade-deployment-kit/releases

2. Download and unzip the release kit for your OS and Architecture (ex. amd64-darwin)


## Usage

1. Open two terminal windows and run these commands in each:

```
./runEdge.sh
```
```
./runConsole.sh
```
Note: If you've already executed ./runEdge.sh once, you will need to run ./reset.sh to execute ./runEdge.sh again.

2. Open browser to <GATEWAY_IP>:3000/provision 

(ex. localhost:3000/provision, or 192.168.7.130:3000/provision)

3. You will be prompted provide the following information

|Parameter|Overview|Example|
|---|---|---|
|Platform URL|Platform on which your `ClearBlade Platform System` is running|https://platform.clearblade.com|
|System Key|`ClearBlade Platform System` System Key|82b1f1bb0beebcebd28fa88590e302|
|System Secret|`ClearBlade Platform System` System Secret|82B1F1BB0BCEA6FCB4C0BBFAC5DE02|
|User Email|Created in Step 1|provisioner@clearblade.com|
|User Password|Created in Step 1|<PASSWORD>|
|Edge Name|Unique Edge Name for this Edge|Gateway1424847363|


4. Your Edge will now be provisioned into the targetted system.

## Detailed workflow

![](workflow.png)

## Contributing

### How to create the edge databases

The deployment kit runs on a preconfigured system which contains portals and services that are responsible for taking user input and creating an edge on behalf of the user. Whenever a change is made in the preconfigured system, the edge databases must be rebuilt in order to see the changes reflected in the end result. This is accomplished by the `devops/setup.sh` script with the following steps:
1. Stand up an edge that uses databases (`devops/baseedgedbs.tar.gz`) that have one empty system in them
2. Once the edge is running, `cb-cli` is used to push all the deployment kit assets into the base system. 
3. By pushing assets to the edge, the edge databases will be modified which will then be packaged for distribution


