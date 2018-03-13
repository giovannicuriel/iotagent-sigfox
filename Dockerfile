FROM node:8

WORKDIR /opt/iotagent-sigfox
#RUN apt-get update \
#    && apt-get install -y python-pip \
#    &&  pip install pyopenssl

COPY . .
RUN npm install && npm run-script build

RUN chmod +x entrypoint.sh

EXPOSE 80

ENTRYPOINT ["./entrypoint.sh"]
