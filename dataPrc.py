import time
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn import linear_model
from scipy.stats import linregress

import boto3
from boto3.dynamodb.conditions import Key

def main():
    # read from dynamoDB and prep the data
    # note that 'time' has the unit in seconds
    daylim = 7
    df_moist = getDb('rasp_data','rasp3b', daylim)
    df_humid = getDb('rasp_data','AHT10humid', daylim)
    df_temp = getDb('rasp_data','AHT10temp', daylim)
    df_moist = df_moist.drop(columns=['category','date'])
    df_moist['date']=pd.to_datetime(df_moist['time'], unit='s')
    df_humid = df_humid.drop(columns=['category','date'])
    df_temp = df_temp.drop(columns=['category','date'])
    # visualize and save data
    df_moist.plot(x="date",y="value", kind="line", title="Soil moisture, last 7 days")
    df_humid.plot(x="time",y="value", kind="line", title="Room humidity, last 7 days")
    df_temp.plot(x="time",y="value", kind="line", title="Room temperature, last 7 days")
    df_moist.to_csv("moist_raw.csv")
    df_humid.to_csv("humid.csv")
    df_temp.to_csv("temp.csv")

    # clean up the data
    # step 1: detect water or unusually events (sensor movement)
    # calc rate of change in moisture level
    df_moist_slope = slopeCalc(df_moist,10, movAvg=True)
    df_moist_slope.reset_index()
    # step 2: remove data near events
    df_moist_slope_todrop = df_moist_slope[abs(df_moist_slope['slope'])>0.2] # for rasp3b use 0.2, rasp4b use 20
    df_moist_slope.plot(x="date",y="slope", kind="line", title="slope after event detection")
    df_moist_slope.reset_index()
    df_moist_slope = dfCleanUp(df_moist_slope, df_moist_slope_todrop, 10, 720)
    # step3: recalculate rate of change in moisture level
    df_moist_clean = slopeCalcSplit(df_moist_slope)
    df_moist_clean.plot(x="date",y="value", kind="scatter", title="value after event removal")
    df_moist_clean.plot(x="date",y="slope", kind="scatter", title="slope after event removal")
    # step4: pull together all other features
    df_moist_humid = dfMerge(df_moist_clean, df_humid, 10, "humid")
    df_moist_humid_temp = dfMerge(df_moist_humid, df_temp, 10, "temp")
    df_moist_humid_temp["hour"] = pd.DatetimeIndex(df_moist_humid_temp['date']).hour

    # save data, ready for prediction
    df_moist_humid_temp.to_csv("data.csv")

    plt.show()
    
# read data from AWS dynamoDB
def getDb(tableName, device, dayLim):
    epochLim = int(time.time()) - 3600 * 24 * dayLim
    dynamodb = boto3.resource('dynamodb', region_name = 'us-west-1')
    table = dynamodb.Table(tableName)
    response = table.query(
        TableName = tableName,
        KeyConditionExpression =Key('device').eq(device) & Key('time').gt(str(epochLim)),
        ScanIndexForward = True
    )
    response = pd.DataFrame.from_dict(response['Items'])
    response['value'] = response['value'].astype(int)
    response['time'] = response['time'].astype(int)
    return response

# calculate slope based on user input
# window size in minutes
def slopeCalc(dfName_pandas, windowSize_min, movAvg=False):
    dfSlope = dfName_pandas
    # optional moving average filter to smooth out the data
    if movAvg:
        dfSlope['value'] = dfSlope['value'].rolling(window = 10, center=True, min_periods=2).mean()
    # calculate slope using 'linregress'
    dfSlope['slope'] = dfSlope['value'].rolling(window = windowSize_min,center=True, min_periods=10).apply(lambda s: linregress(s.reset_index())[0])
    return dfSlope

# drop data near detected events
# dfDrop contains the events to be dropped, with window specified in minBefore and minAfter in minutes
def dfCleanUp(dfIn, dfDrop, minBefore, minAfter):
    dfReturn = dfIn
    for index, row in dfDrop.iterrows():
        droptime = row['time']
        dfReturn = dfReturn.drop(dfReturn[(dfReturn['time']>(droptime-60*minBefore))&(dfReturn['time']<(droptime+60*minAfter))].index)
    dfReturn["timeDiff"] = dfReturn["time"].diff()
    return dfReturn

# calculate slope with non-continuous time stamp, detect pieces of data and calculate slopes
def slopeCalcSplit(dfName_pandas):
    dfSlope = dfName_pandas
    dfReturn = pd.DataFrame()
    # filter out the split points
    dfSplit = dfSlope[dfSlope['timeDiff']>120]
    for index, row in dfSplit.iterrows():
        # start from oldest data from the "left", drop data pieces as processed
        dfLeft = dfSlope[dfSlope["time"]<row["time"]]
        dfSlope = dfSlope.drop(dfSlope[dfSlope["time"]<row["time"]].index)
        if len(dfLeft) > 60:
            dfLeft = slopeCalc(dfLeft, 60)
            dfLeft = dfLeft.assign(segment=row["time"])
            dfReturn = pd.concat([dfReturn, dfLeft])
    # continue with the most recent "piece" of data
    dfSlope = slopeCalc(dfSlope, 60)
    dfSlope = dfSlope.assign(segment=0)
    dfReturn = pd.concat([dfReturn, dfSlope])
    dfReturn=dfReturn.dropna()
    return dfReturn

# pull together feature from other sources in dfNewData, with synmetrical time window "range_min" in minutes and label "name"
def dfMerge(dfRef, dfNewData, range_min, name):
    dfReturn = dfRef
    for index, row in dfRef.iterrows():
        curTime = row["time"]
        # a search based on time stamps
        dfTimeFrame = dfNewData[(dfNewData["time"] > (curTime-60*range_min))&(dfNewData["time"] < (curTime+60*range_min))]
        # mean value in the window
        dfReturn.loc[index, name] = dfTimeFrame["value"].mean()
    return dfReturn

if __name__ == "__main__":
    main()

