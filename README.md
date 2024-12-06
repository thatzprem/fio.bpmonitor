# BP Monitor

## Overview
This app builds and hosts information about FIO Chain Block Producers.

## Build

### Set-up nginx
```angular2html
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Set-up postgres
```angular2html
sudo apt-get install postgresql postgresql-contrib -y
sudo -u postgres psql
CREATE DATABASE bpmonitor_db;
CREATE USER bpmonitor_usr WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE bpmonitor_db TO bpmonitor_usr;
ALTER USER bpmonitor_usr CREATEDB;
\c bpmonitor_db
GRANT USAGE, CREATE ON SCHEMA public TO bpmonitor_usr
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bpmonitor_usr
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bpmonitor_usr;
ALTER SCHEMA public OWNER TO bpmonitor_usr;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bpmonitor_usr;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO your_username
\q
```

### Install
```angular2html
git clone https://github.com/fioprotocol/fio.bpmonitor
cd fio.bpmonitor
npm install
```

### Configure
```angular2html
nano .env
BASE_URL="https://yoururl"
DATABASE_URL=postgresql://bpmonitor_usr:your_password@localhost:5432/bpmonitor_db
PORT=4000
```
or whatever else you want from [env.ts](https://github.com/fioprotocol/fio.bpmonitor/blob/master/src/config/env.ts)

### Build
```angular2html
npm run build
```
Don't forget to set-up ngnix.

### Run
```angular2html
npm run start
```
or setup pm2
```angular2html
pm2 start dist/app.js --name bpmonitor
```

## Web
### Paths
|Path|Description|Params|
|---|---|---|
|/|Producers sorted by Score|chain:Testnet/Mainnet|
|/nodes|Nodes sorted by Score|chain:Testnet/Mainnet, type:**api**/seed/producer|

## API
### Endpoints
|Name|Endpoint|Params|
|---|---|---|
|Get Producers|/api/producers|chain:testnet/mainnet, sortBy:**total_votes**/score|
|Get Nodes|/api/nodes|chain:testnet/mainnet, type:**api**/seed/producer|
|Get Fees|/api/fess|chain:testnet/mainnet, type:**by_fee**/by_producer|
|Get Bundles|/api/bundles|chain:testnet/mainnet|
|Get Proposals|/api/proposal|chain:testnet/mainnet|
|Get Scores|/api/scores|producerId: number|