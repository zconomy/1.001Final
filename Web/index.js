const express = require('express');
const app = express();
const AWS = require('aws-sdk');

AWS.config.update({region: 'us-west-1'});

var https = require('https');
var http = require('http');
var fs = require('fs');
const axios = require('axios')

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
  var returnData = {
    label: [],
    data: []
  };
  var dynamodb = new AWS.DynamoDB();

  var params = {
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
      }
      
    });
    if (err)
    {
      console.log(err, err.stack); // an error occurred
    }
    else
    {
      console.log("success in chart!");           // successful response
      res.send(returnData);
    }
  });
});
