# iotagent-sigfox

Environment variables:

Defined by iotagent-nodejs library:

- DEVM_ADDRESS: where to find DeviceManager. Default is "device-manager:5000"
- AUTH_ADDRESS: where to find Auth. Default is "auth:5000"
- DATA_BROKER_ADDRESS: where to find DataBroker. Default is "data-broker:80"
- KAFKA_ADDRESS: where to find Kafka. Default is "kafka:9092"

Defined by iotagent-sigfox:

- SIGFOX_BACKEND_SERVER: where Sigfox backend can be accessed. Default is "localhost:8008"
- IOTAGENT_SIGFOX_CACHE_HOST: where an instance of Redis can be accessed. Default is "iotagent-sigfox-redis"