#! /bin/bash

sh scripts/remove_artifacts.sh
sleep 2
sh scripts/create_mac_builds.sh
sleep 2
sh scripts/create_universal.sh
sleep 2
sh scripts/create_universal_dmg.sh