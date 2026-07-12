FROM alpine:3.20

RUN apk add --no-cache postgresql16-client bash aws-cli age

COPY deploy/backup.sh /usr/local/bin/backup.sh
COPY deploy/verify-backup.sh /usr/local/bin/verify-backup.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/verify-backup.sh \
    && echo "0 3 * * * /usr/local/bin/backup.sh >> /backups/backup.log 2>&1" > /etc/crontabs/root

HEALTHCHECK --interval=5m --timeout=30s --retries=3 \
  CMD /usr/local/bin/verify-backup.sh /backups

CMD ["crond", "-f", "-l", "2"]
