const express = require('express');
const app = express();
const AWS = require('aws-sdk');

AWS.config.update({region: 'us-west-1'});

var https = require('https');
var http = require('http');
var fs = require('fs');

const axios = require('axios');
const waterThresh = new Array();
const predModel = new Array();

setInterval(autoWaterFunc, 1800000);

var options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
};

https.createServer(options, app).listen(443);

http.createServer(function (req, res) {
  res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
  res.end();
}).listen(80);

app.use(express.static('public'));

app.get('/', function(req, res){
  res.send('this is a dummy page, try /take, /take3b, /water, /water3b or /view');
});

app.get('/take', function(req, res){
  var dynamodb = new AWS.DynamoDB();
  var date_now = new Date();
  var sec_now = (Math.round(date_now.getTime() / 1000)).toString();
  date_now = date_now.toString();
  const params = {
    Item: {
     "device": {
       S: req.query.device
      }, 
     "time": {
       S: sec_now
      }, 
     "date": {
       S: date_now
      },
      "category": {
       S: "status"
      },
      "value": {
        S: "take"
       }
    }, 
    ReturnConsumedCapacity: "TOTAL", 
    TableName: "rasp_control"
  };
  dynamodb.putItem(params, function(err, data){
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
  setTimeout(() => {res.send("Picture taken")}, 3000);
});

app.get('/water', function(req, res){
  var dynamodb = new AWS.DynamoDB();
  var date_now = new Date();
  var sec_now = (Math.round(date_now.getTime() / 1000)).toString();
  date_now = date_now.toString();
  const params = {
    Item: {
     "device": {
      S: req.query.device
      }, 
     "time": {
       S: sec_now
      }, 
     "date": {
       S: date_now
      },
      "category": {
       S: "status"
      },
      "value": {
        S: "water"
       }
    }, 
    ReturnConsumedCapacity: "TOTAL", 
    TableName: "rasp_control"
  };
  dynamodb.putItem(params, function(err, data){
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
  setTimeout(() => {res.send("Plant watered, picture taken");}, 3000);
});

app.get('/view', function(req, res){
  let s3 = new AWS.S3();
  async function getImage(){
          const data =  s3.getObject(
            {
                Bucket: 'waterpic',
                Key: 'pic.jpg'
              }
            
          ).promise();
          return data;
        }
  getImage()
    .then((img)=>{
          let image="<img src='data:image/jpeg;base64," + encode(img.Body) + "'" + "width='800' height='600' " + "/>";
          res.send(image);
        })
  function encode(data){
            let buf = Buffer.from(data);
            let base64 = buf.toString('base64');
            return base64;
        }
});

app.get('/preview', function(req, res){
  let s3 = new AWS.S3();
  async function getImage(){
          const data =  s3.getObject(
            {
                Bucket: 'waterpic',
                Key: 'pic.jpg'
              }
            
          ).promise();
          return data;
        }
  getImage()
    .then((img)=>{
          let image="<img src='data:image/jpeg;base64," + encode(img.Body) + "'" + "width='200' height='150' " + "/>";
          res.send(image);
        })
  function encode(data){
            let buf = Buffer.from(data);
            let base64 = buf.toString('base64');
            return base64;
        }
});

app.get('/identify', function(req, res){
  let s3 = new AWS.S3();
  async function getImage(){
          const data =  s3.getObject(
            {
                Bucket: 'waterpic',
                Key: 'pic.jpg'
              }
            
          ).promise();
          return data;
        }
  getImage()
    .then((img)=>{
          const base64files = [encode(img.Body)];
          const data = {
            //api_key: "true API removed for security",
            images: base64files,
            modifiers: ["crops_fast", "similar_images", "health_all", "disease_similar_images"],
            plant_language: "en",
            plant_details: ["common_names",
                "url",
                "name_authority",
                "wiki_description",
                "taxonomy",
                "synonyms"],
            disease_details: ["common_names", "url", "description"]
          };
          axios.post('https://api.plant.id/v2/identify', data).then(apiRes => {
            console.log('Success');
            res.send(apiRes.data);
          }).catch(error => {
              console.error('Error: ', error)
          })
          
        })
  function encode(data){
            let buf = Buffer.from(data);
            let base64 = buf.toString('base64');
            return base64;
        }
});


app.get('/chart', function(req, res){
  var deviceName = req.query.device;
  var predLen = 72; //hours, prediction
  var returnData = {
    label: [],
    data: [],
    data_ref: [],
    data_pred: []
  };
  var thresh = NaN;
  
  waterThresh.forEach(function(obj, index, array) {
    if(obj.device == deviceName)
    {
      thresh = obj.thresh;
    }
  });

  var dynamodb = new AWS.DynamoDB();
  var humid = NaN;
  var temp = NaN;
  deviceName = "AHT10humid";
  var params = {
    ExpressionAttributeValues: {
     ":v1": {
       S: deviceName
      }
    }, 
    KeyConditionExpression: "device = :v1", 
    TableName: "rasp_data",
    ScanIndexForward: false,
    Limit: 1
  };
  dynamodb.query(params, function(err, data) {
    data.Items.forEach(function(element, index, array) {
      if (element.value.S == null)
      {
        humid = Number(element.value.N);
      }
      else
      {
        humid = Number(element.value.S);
      }
      
    });
    if (err)
    {
      console.log(err, err.stack); // an error occurred
    }
    else
    {
      console.log(deviceName, humid);           // successful response
      
      deviceName = "AHT10temp";
      params = {
        ExpressionAttributeValues: {
         ":v1": {
           S: deviceName
          }
        }, 
        KeyConditionExpression: "device = :v1", 
        TableName: "rasp_data",
        ScanIndexForward: false,
        Limit: 1
      };
      dynamodb.query(params, function(err, data) {
        data.Items.forEach(function(element, index, array) {
          if (element.value.S == null)
          {
            temp = Number(element.value.N);
          }
          else
          {
            temp = Number(element.value.S);
          }
          
        });
        if (err)
        {
          console.log(err, err.stack); // an error occurred
        }
        else
        {
          console.log(deviceName, temp);           // successful response
          deviceName = req.query.device;

          params = {
            ExpressionAttributeValues: {
             ":v1": {
               S: deviceName
              }
            }, 
            KeyConditionExpression: "device = :v1", 
            TableName: "rasp_data",
            ScanIndexForward: false,
            Limit: 10080
          };
          dynamodb.query(params, function(err, data) {
            data.Items.forEach(function(element, index, array) {
              returnData.label.unshift(Number(element.time.S));
              if (element.value.S == null)
              {
                returnData.data.unshift(Number(element.value.N));
              }
              else
              {
                returnData.data.unshift(Number(element.value.S));
                returnData.data_ref.unshift(thresh);
                returnData.data_pred.unshift(NaN);
              }
              
            });
            if (err)
            {
              console.log(err, err.stack); // an error occurred
            }
            else
            {
              console.log("success in chart!");           // successful response
              predModel.forEach(function(obj, index, array) {
                if(obj.device == deviceName)
                {
                  var curSec = returnData.label[returnData.label.length-1];
                  var dt = new Date(1000*curSec);
                  var curHour = dt.getUTCHours();
                  var curMoist = returnData.data[returnData.data.length-1]
                  console.log("hour", curHour);
                  console.log("humid", humid);
                  console.log("temp", temp);
                  for (let i = 0; i < predLen; i++) {
                    curSec = curSec + 3600;
                    returnData.label.push(curSec);
                    curHour = curHour + 1;
                    if(curHour >= 24)
                    {
                      curHour = curHour - 24;
                    }
                    curMoist = curMoist + Number(obj.value)*curMoist + Number(obj.humid)*humid + Number(obj.temp)*temp + Number(obj.hour)*curHour + Number(obj.intercept);
                    returnData.data_pred.push(curMoist);
                    returnData.data_ref.push(thresh);
                    returnData.data.push(NaN);
                  }
                }
              });
              res.send(returnData);
            }
          });
        }
      });
    }
  });
});

app.get('/setThresh', function(req, res){
  var deviceName = req.query.device;
  var thresh = req.query.thresh;
  var isFound = false;

  if (waterThresh.length>0)
  {
    waterThresh.forEach(function(obj, index, array) {
      if(obj.device == deviceName)
      {
        obj.thresh = thresh;
        isFound = true;
        console.log("thresh updated");
      }
    });
  }

  if (isFound == false)
  {
    const threshObj = new Object(); 
    threshObj.device = deviceName;
    threshObj.thresh = thresh;
    waterThresh.push(threshObj);
    console.log("thresh added");
  }
  res.send(thresh);
});

app.get('/setPred', function(req, res){
  var deviceName = req.query.device;

  var param_value = req.query.value;
  var param_humid = req.query.humid;
  var param_temp = req.query.temp;
  var param_hour = req.query.hour;
  var param_intercept = req.query.intercept;

  var isFound = false;
  if (predModel.length>0)
  {
    predModel.forEach(function(obj, index, array) {
      if(obj.device == deviceName)
      {
        obj.value = param_value;
        obj.humid = param_humid;
        obj.temp = param_temp;
        obj.hour = param_hour;
        obj.intercept = param_intercept;
        isFound = true;
        console.log("model updated");
      }
    });
  }

  if (isFound == false)
  {
    const predObj = new Object(); 
    predObj.device = deviceName;
    predObj.value = param_value;
    predObj.humid = param_humid;
    predObj.temp = param_temp;
    predObj.hour = param_hour;
    predObj.intercept = param_intercept;
    predModel.push(predObj);
    console.log("model added");
  }
  console.log(predModel);
  res.send("model updated");
});

function autoWaterFunc() {
  console.log('autoWater Working');
  console.log(waterThresh);
  
  if (waterThresh.length>0)
  {
    var dynamodb = new AWS.DynamoDB();
    waterThresh.forEach(function(obj, index, array) {
      var moist = 0;
      var deviceName = obj.device;
      var params = {
        ExpressionAttributeValues: {
         ":v1": {
           S: deviceName
          }
        }, 
        KeyConditionExpression: "device = :v1", 
        TableName: "rasp_data",
        ScanIndexForward: false,
        Limit: 1
      };
      dynamodb.query(params, function(err, data) {
        data.Items.forEach(function(element, index, array) {
          if (element.value.S == null)
          {
            moist = Number(element.value.N);
          }
          else
          {
            moist = Number(element.value.S);
          }
          console.log(moist);
        });
        if (err)
        {
          console.log(err, err.stack); // an error occurred
        }
        else
        {
          if (moist > obj.thresh)
          {
            console.log("water", deviceName);
            var date_now = new Date();
            var sec_now = (Math.round(date_now.getTime() / 1000)).toString();
            date_now = date_now.toString();
            const putParams = {
              Item: {
               "device": {
                S: deviceName
                }, 
               "time": {
                 S: sec_now
                }, 
               "date": {
                 S: date_now
                },
                "category": {
                 S: "status"
                },
                "value": {
                  S: "water"
                 }
              }, 
              ReturnConsumedCapacity: "TOTAL", 
              TableName: "rasp_control"
            };
            dynamodb.putItem(putParams, function(err, data){
              if (err) console.log(err, err.stack); // an error occurred
              else     console.log(data);           // successful response
            });
          }
          else
          {
            console.log("no need water", deviceName);
          }
        }
 
      });
    });

  }

}

