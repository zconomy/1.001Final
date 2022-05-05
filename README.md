# 1.001_final

Nothing here.

# set port 80
sudo setcap 'cap_net_bind_service=+ep' `which node`

# use forever for the web server
forever start index.js
forever stopall

# set rasp wifi priority:
/etc/dhcpcd.conf
interface wlan0
metric 200

# notes for hardware
Raspberry PI: AHT10 sensor connects to the pi via SPI
Arduino: connects to the PI via USB serial, one PI can accommondate multiple arduinos
Humidity sensor: connects to arduino via ADC
Relay: Arduino DO for relay control signal, use PI's 5V pin for power input
Pump: connects to relay via USB pin-out board