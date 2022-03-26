import serial
import threading
import time
import datetime
import boto3
import smbus
import decimal
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from picamera import PiCamera

deviceName = 'default'

#############################
# program enters here, and then to the threads
#############################
def main():
    heartBeat()
    if deviceName != 'AHT10':
        readCtrlDbTask()
        readSerialTask()

#############################
# report to DB every 5 sec
#############################
def heartBeat():
    putDb('rasp_ping', deviceName, 'ping', 'ON')
    if deviceName == 'AHT10':
        m = AHT10(1)
        tmpData = m.getData()
        th1 = threading.Thread(target=putDb, args=('rasp_data', deviceName+'temp', 'temp', Decimal(tmpData[0])))
        th2 = threading.Thread(target=putDb, args=('rasp_data', deviceName+'humid', 'humid', Decimal(tmpData[1])))
        th1.start()
        th2.start()
        thread_heartBeat = threading.Timer(600, heartBeat)
    else:
        thread_heartBeat = threading.Timer(5.0, heartBeat)
    thread_heartBeat.start()

#############################
# ask the microcontroller to water as requested
#############################
def writeSerialTask():
    ser = serial.Serial('/dev/ttyACM0', 9600, timeout=1)
    ser.write(b"water\n")

#############################
# read from the microcontroller about feedbacks
#############################
def readSerialTask():
    ser = serial.Serial('/dev/ttyACM0', 9600, timeout=1)
    newMsg = 0
    while newMsg < 1:
        if ser.is_open > 0:
            if ser.in_waiting > 0:
                fdbk = ser.readline().decode('utf-8').rstrip()
                newMsg = 1
                print(fdbk)
                if fdbk.isnumeric() == True:
                    th = threading.Thread(target=putDb, args=('rasp_data', deviceName, 'moisture', fdbk))
                if fdbk == 'watering':
                    th = threading.Thread(target=putDb, args=('rasp_control', deviceName, 'status', fdbk))
                elif fdbk == 'watered':
                    th = threading.Thread(target=putDb, args=('rasp_control', deviceName, 'status', fdbk))
                else:
                    print('unexpected feedback message')
                    print(fdbk)
    th.start()
    thread_serialRead = threading.Timer(0.5, readSerialTask)
    thread_serialRead.start()

#############################
# put feedback data to DB
#############################
def putDb(tableName, device, category, value):
    dateNow = str(datetime.datetime.now())
    timeNow = str(int(time.time()))
    dynamodb = boto3.resource('dynamodb', region_name = 'us-west-1')
    table = dynamodb.Table(tableName)
    response = table.put_item(
       Item={
            'device': device,
            'time': timeNow,
            'date': dateNow,
            'category': category,
            'value': value
        }
    )
    return response

#############################
# query control data and take action
#############################
def readCtrlDbTask():
    dynamodb = boto3.resource('dynamodb', region_name = 'us-west-1')
    table = dynamodb.Table('rasp_control')
    response = table.query(
        KeyConditionExpression = Key('device').eq(deviceName),
        Limit = 1,
        ScanIndexForward = False
    )
    webCmd = response['Items'][0]['value']
    if webCmd == 'take':
        takePic()
    elif webCmd == 'water':
        writeSerialTask()
        takePic()
    else:
        print('idling...')
        print(webCmd)
    thread_ctrlTask = threading.Timer(1.0, readCtrlDbTask)
    thread_ctrlTask.start()

#############################
# take a picture and send to S3
#############################
def takePic():
    res = putDb('rasp_control', deviceName, 'status', 'taking')
    filePath = CamPic()
    sts = putS3(filePath, 'waterpic', 'pic.jpg')
    res = putDb('rasp_control', deviceName, 'status', 'taken')

#############################
# take a picture using camera
#############################
def CamPic():
    camera = PiCamera()
    time.sleep(2)
    picPath = "/home/pi/water_pi/pic.jpg"
    camera.resolution = (1600, 1200)
    camera.capture(picPath)
    print("Pic Done")
    camera.close()
    return picPath

#############################
# upload file to S3
#############################
def putS3(filePath, bucketName, keyName):
    s3 = boto3.client('s3', region_name='us-west-1')
    try:
        s3.upload_file(filePath, bucketName, keyName)
        print("Upload Successful")
        retVal = True
    except FileNotFoundError:
        print("The file was not found")
        retVal = False
    except NoCredentialsError:
        print("Credentials not available")
        retVal = False
    return retVal

#############################
# class for Temperature/humidity sensor AHT10
# from: https://github.com/momoru-kun/AHT10
#############################
class AHT10:
    CONFIG = [0x08, 0x00]
    MEASURE = [0x33, 0x00]

    # bus - I2C bus. "ls /dev | grep i2c-"
    # addr - AHT10 I2C address. Default is 0x38
    # using AHT10 I2C may cause bugs to bluetooth (I do not use bluetooth)
    def __init__(self, bus, addr=0x38):
        self.bus = smbus.SMBus(bus)
        self.addr = addr
        self.bus.write_i2c_block_data(self.addr, 0xE1, self.CONFIG)
        time.sleep(0.2) #Wait for AHT to do config > 20ms

    # getData - gets temperature and humidity
    # returns tuple: getData[0] is Temp, getData[1] is humidity
    def getData(self):
        byte = self.bus.read_byte(self.addr)
        self.bus.write_i2c_block_data(self.addr, 0xAC, self.MEASURE)
        time.sleep(0.5) # wait for readings > 75ms
        data = self.bus.read_i2c_block_data(self.addr, 0x00)
        temp = ((data[3] & 0x0F) << 16) | (data[4] << 8) | data[5]
        ctemp = (temp / 1048576)*200 - 50
        hum = ((data[1] << 16) | (data[2] << 8) | data[3]) >> 4
        chum = int((hum  / 1048576)* 100)
        return (ctemp, chum)

if __name__ == "__main__":
    if deviceName == 'default':
        deviceName = input("Enter device name, rasp4 or rasp3b: ")
    main()

