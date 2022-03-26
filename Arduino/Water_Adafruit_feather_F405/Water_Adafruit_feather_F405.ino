#include <Adafruit_NeoPixel.h>

//#define FLAG_TEST

#define LED_PIN 8U            // NeoPixel is on PIN 8
#define LED_COUNT 1U

#define VBATPIN A6

#define CH_IO_TASK 2U // Timer channel 2 for control ISR
#define FDBK_PIN A5           // A5 for analog measure
#define DEBUG_PIN_5 5U        // PIN 5 for debugging
#define WATER_PIN_6 6U        // PIN 6 for water control, HIGH = turn on valve
#define ISR_CYCLE_US 1000UL   //1 sec, or 1ms
#define FDBK_CYCLE_US 60000UL //60 sec
#define WATER_CYCLE_US 1500UL //1.5 sec
#define READING_ARRAY_SIZE 1024UL // Array length 1024, a good number to do divide

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
void CTRL_LedFlash(void);
void IoTask(void);

// init global control variables
String CTRL_writeStr = "";
bool CTRL_writeReq = false;
bool CTRL_readReq = false;
bool CTRL_watered = false;
uint32_t CTRL_waterCnt = 0UL;
// init moving average filters
uint32_t ADC_reading[READING_ARRAY_SIZE];
uint32_t ADC_avg = 0UL;
uint32_t ADC_sum = 0UL;

/////////////////////////////////
// setup function
// one-time startup initialization
/////////////////////////////////
void setup(void)
{
  uint32_t reading = 0UL;
  uint32_t index = 0UL;
  // init serial connection
  Serial.begin(9600);

  // init the on-board LED
  strip.begin();
  strip.setBrightness(5);
  strip.setPixelColor(0, 255, 0, 255);
  strip.show();

  // Config analog pin
  analogReadResolution(12);
  reading = (uint32_t)(analogRead(FDBK_PIN));
  // initialize reading array
  for(index = 0; index < READING_ARRAY_SIZE; ++index)
  {
    ADC_reading[index] = reading;
  }
  ADC_avg = reading;
  ADC_sum = reading * READING_ARRAY_SIZE;

  // Config digital pin
  pinMode(DEBUG_PIN_5, OUTPUT);
  pinMode(WATER_PIN_6, OUTPUT); // PIN 6 controls the relay
  digitalWrite(DEBUG_PIN_5, HIGH);
  digitalWrite(WATER_PIN_6, LOW);

  // Config control ISR
  TIM_TypeDef *Instance = TIM14;
  HardwareTimer *MyTim = new HardwareTimer(Instance);
  MyTim->setMode(CH_IO_TASK, TIMER_DISABLED); // for STM32duino 
  MyTim->setOverflow(ISR_CYCLE_US, MICROSEC_FORMAT); // 1000 us for now due to slow ADC issue
  MyTim->attachInterrupt(IoTask); // init only, do not start ISR here

  // Wait forever here if the comm channel does not init
  while(!Serial)
  {
    // go panic while waiting
    CTRL_LedFlash();
    strip.show();
    delay(10);
  }
#ifndef FLAG_TEST
  strip.clear();
  strip.show();
#endif
  
  // Start the control ISR after init
  MyTim->resume();
}

/////////////////////////////////
// loop function
// background tasks
/////////////////////////////////
void loop(void)
{
  // write to serial as requested in the backgroud by control ISR
  // wait until watering finshes
  if(CTRL_writeReq && (CTRL_waterCnt==0UL) && (CTRL_watered == false))
  {
    CTRL_LedFlash(); // change LED color for each action
    Serial.println(CTRL_writeStr);
    CTRL_writeReq = false;
  }

  // watering routine is done, report back to serial
  // this task is done after CTRL_writeReq for analog data
  if(CTRL_watered)
  {
    CTRL_LedFlash(); // change LED color for each action
    CTRL_watered = false;
    Serial.println(String("watered"));
  }

  // read from serial as requested in the backgroud by control ISR
  if(CTRL_readReq)
  {
    CTRL_LedFlash(); // change LED color for each action
    
    // read string from serial
    String incomeStr = Serial.readString();
    CTRL_readReq = false;

    // right now only "water" is supported
    if(incomeStr == String("water\n"))
    {
      CTRL_waterCnt = WATER_CYCLE_US;
      Serial.println(String("watering")); // report back to serial
    }
    else
    {
      // if not supported, bounce back to serial
      Serial.println(incomeStr);
    }
  }

  // end of this slow background task
}

/////////////////////////////////
// LED Support function
// Change to an another random color
/////////////////////////////////
void CTRL_LedFlash(void)
{
    strip.setPixelColor(0, (long)random(0, 255), (long)random(0, 255), (long)random(0, 255));
#ifdef FLAG_TEST
    strip.show();
#endif
}

/////////////////////////////////
// IoTask ISR (control ISR)
// 1ms task
/////////////////////////////////
void IoTask(void)
{
  static uint32_t isrCnt = 0UL;
  static uint32_t secCnt = 0UL;
  uint32_t reading = 0UL;
  static uint32_t arrayHead = 0UL;

  // update adc moving avg, filter out ADC noise, window = 1024ms
  reading = analogRead(FDBK_PIN);
  ADC_sum = ADC_sum + reading - ADC_reading[arrayHead];
  ADC_avg = ADC_sum / READING_ARRAY_SIZE;
  ADC_reading[arrayHead] = reading;
  
  if((++arrayHead) >= READING_ARRAY_SIZE)
  {
    arrayHead = 0UL;
  }

  // ask the background task to read serial when available
  if (Serial.available() > 0)
  {
    CTRL_readReq = true;
  }

  // read from analog feedback regularly and send back
  if(++isrCnt == FDBK_CYCLE_US)
  {
    isrCnt = 0UL;
    CTRL_writeStr = String(ADC_avg);
    CTRL_writeReq = true;
  }

  // control watering and its timer
  // CTRL_waterCnt set by background task
  if(CTRL_waterCnt > 0UL)
  {
    // water as requested
    digitalWrite(WATER_PIN_6, HIGH);

    if((--CTRL_waterCnt) == 0UL)
    {
      // let backgroud task toggle this back
      // and report back to serial
      CTRL_watered = true;
    }
  }
  else
  {
    // no need to water, keep the pump off
    digitalWrite(WATER_PIN_6, LOW);
  }
  return;
}

// end of file
