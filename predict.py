import numpy
import time
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn import linear_model

import boto3
from boto3.dynamodb.conditions import Key

def main():
    daylim = 7
    df_moist = getDb('rasp_data','rasp3b', daylim)
    df_humid = getDb('rasp_data','AHT10humid', daylim)
    df_temp = getDb('rasp_data','AHT10temp', daylim)
    df_moist = df_moist.drop(columns=['category','date'])
    df_humid = df_humid.drop(columns=['category','date'])
    df_temp = df_temp.drop(columns=['category','date'])
    df_moist.plot(x="time",y="value", kind="line", title="Soil moisture, last 7 days")
    df_humid.plot(x="time",y="value", kind="line", title="Room humidity, last 7 days")
    df_temp.plot(x="time",y="value", kind="line", title="Room temperature, last 7 days")
    plt.show()
    

def getDb(tableName, device, dayLim):
    epochLim = int(time.time()) - 3600 * 24 * dayLim
    dynamodb = boto3.resource('dynamodb', region_name = 'us-west-1')
    table = dynamodb.Table(tableName)
    response = table.query(
        TableName = tableName,
        KeyConditionExpression =Key('device').eq(device) & Key('time').gt(str(epochLim)),
        ScanIndexForward = False
    )
    response = pd.DataFrame.from_dict(response['Items'])
    response['value'] = response['value'].astype(int)
    response['time'] = response['time'].astype(int)
    return response


if __name__ == "__main__":
    main()

