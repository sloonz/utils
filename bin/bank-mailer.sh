#!/bin/sh

trap "exit 1" USR1

suicide() {
  kill -USR1 $$
  exit 1
}

if [ "$1" = "-cron" ]; then
  if [ "`date +%j`" = "`cat ~/.cache/bank-mailer/last_check`" ] ; then
    exit 0
  fi
fi
(boobank -f csv list || kill -USR1 $$) | tail -n +2 |
while read account; do
  IFS=';' read id type balance _ignore <<< "$account"
  (boobank -f csv history $id || kill -USR1 $$) |
  tail -n +2 | cut -d';' -f2- |
  while read operation; do
    sum=`md5sum <<< "$operation" | awk '{print $1}'`
    if ! grep "$sum" ~/.cache/bank-mailer/ids > /dev/null; then
      sleep 2
      IFS=';' read date label amount _ignore <<< "$operation"
      mail -s "Operation du $date sur $type $id" "bank-accounts@simon.lipp.name" -- -f bank-mailer@simon.lipp.name <<eof
Account balance: $balance

$date   $amount EUR
  $label
eof
      [ $? = 0 ] || suicide
      echo $sum >> ~/.cache/bank-mailer/ids
    fi
  done
done

date +%j > ~/.cache/bank-mailer/last_check
