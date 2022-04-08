#!/bin/bash

cd /opt/openhim-mediator-file-queue/scripts
./repopulate.sh subscription
./repopulate.sh subscriptionIdentification
./repopulate.sh subscriptionRegistration
./repopulate.sh optout
./repopulate.sh helpdesk
./repopulate.sh loss
./repopulate.sh nurseSubscription
./repopulate.sh nurseOptout
./repopulate.sh nurseHelpdesk
./repopulate.sh switch
./repopulate.sh pmtctOptout
./repopulate.sh pmtctSubscription
./repopulate.sh messageChannel
