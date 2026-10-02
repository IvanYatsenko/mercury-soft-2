
#include <stddef.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>

//#include "include/core.h"
//#include "app/gpio.h"
#include "drivers/gpio-alloc.h"
#include "drivers/sys.h"
#include "drivers/adc.h"
//#include "drivers/dac.h"
#include "drivers/dma.h"
#include "drivers/tim.h"
#include "drivers/usart.h"
#include "drivers/spi.h"
#include "drivers/itmp.h"
#include "drivers/itmp_serial.h"
#include "lpalg/CBOR.h"
#include "drivers/pwm.h"
//#include "storage.h"
#include "MAX6675.hpp"
#include "sn74c595.hpp"

//#include "fan.hpp"
//#include "app/lamp.hpp"
//#include "app/pump.hpp"
//#include "NTCCalc.h"


void delay(unsigned int us)
{
unsigned int startT = get_us();

while ((get_us() - startT) < us) 
{
  __no_operation();
  wdg_reset();
}    
//  while (us>0)
//    {
//    for (int i=0;i<10;i++)
//      
//    us--;
//    }
}

unsigned char board_address = 2;

typedef struct
{
  __IO uint16_t MSR; //0x1FFFF7E0
  __IO uint16_t Res2; //0x1FFFF7E2
  __IO uint16_t Res4; //0x1FFFF7E4
  __IO uint16_t Res6; //0x1FFFF7E6
  __IO uint32_t ID0;
  __IO uint32_t ID1;
  __IO uint32_t ID2;
} ID_TypeDef;

#define ID                  ((ID_TypeDef *) 0x1FFFF7E0)

/*void readaddress()
  {
  gpio_pin pin1,pin2,pin3;
  pin1.acquire(PORTC | PIN13,GPIO_IN_PULLUP);
  pin2.acquire(PORTC | PIN14,GPIO_IN_PULLUP);
  pin2.acquire(PORTC | PIN15,GPIO_IN_PULLUP);
  delay(1000);
  board_address=0x08;
  if (pin1.read()==0) board_address|=0x01;
  if (pin2.read()==0) board_address|=0x02;
  if (pin2.read()==0) board_address|=0x04;
  pin1.release();
  pin2.release();
  pin3.release();
  }*/

extern uint32_t volatile ms;

//int process_input_byte(char c,char* buf, int* ln, int bufsz);
//void process_output_buf(char* buf, int ln);

char uniqueid[16];

//int startl();
//void pollitmp();

//unsigned int EXTI1_IRQ_cntr = 0;
//unsigned int EXTI9_5_IRQ_cntr = 0;
//unsigned int EXTI15_10_IRQ_cntr = 0;
//
//unsigned int EXTI1_FREQ = 0;
//unsigned int EXTI9_5_FREQ = 0;
//unsigned int EXTI15_10_FREQ = 0;

int GPI_A1_state = 0;
int GPI_B5_state = 0;
//int GPI_B8_state = 0;
//int GPI_B9_state = 0;
//int GPI_C13_state = 0;
//int GPI_C14_state = 0;
//int GPI_B15_state = 0;

//unsigned int fan1_cntr = 0;
//unsigned int fan2_cntr = 0;
//unsigned int fan3_cntr = 0;
//unsigned int fan4_cntr = 0;
//unsigned int fans_cntr = 0;
unsigned int extfan1_cntr = 0;
unsigned int extfan2_cntr = 0;

//unsigned int fan1_freq = 0;
//unsigned int fan2_freq = 0;
//unsigned int fan3_freq = 0;
//unsigned int fan4_freq = 0;
//unsigned int fans_freq = 0;
unsigned int extfan1_freq = 0;
unsigned int extfan2_freq = 0;

//int T1,T2;
//gpio_pin ios[3];
//gpio_pin fans[4];
//gpio_pin fansns[5];
gpio_pin extfansns[2];

gpio_pin PiON(PORTB | PIN1, GPIO_OUT_PUSHPULL_10MHz);


unsigned int const GS_NOT_INITIALIZED = 0;
unsigned int const GS_WORKING = 1;
unsigned int const GS_ITMP_NO_CMD_TIMEOUT = 2;
unsigned int const GS_TSENSOR_ERR = 4;
unsigned int const GS_OVERHEAT = 8;
unsigned int const GS_POWERKEY = 16;
unsigned int const GS_SHUTDOWN = 32;
unsigned int const GS_EMSTOP_ERR = 64;
unsigned int const GS_OTHER_ERR = 128;
unsigned int const GS_RESET_MASK = GS_ITMP_NO_CMD_TIMEOUT | GS_TSENSOR_ERR | GS_OVERHEAT | GS_SHUTDOWN | GS_EMSTOP_ERR | GS_OTHER_ERR;

unsigned int const GS_STARTING = 256;
unsigned int const GS_SHUTDOWN_AFTER_RELEASE = 1024;

unsigned int globalstate = GS_NOT_INITIALIZED;


gpio_pin pwrcs;
//gpio_pin stlcs;
gpio_pin adc1cs;
gpio_pin adc2cs;
//gpio_pin adc3cs;

const int lvouts_count = 6;
gpio_pin lvout[lvouts_count];

//SN74C595 stlpower(&stlcs,&spi1);

SN74C595 acpower(&pwrcs,&spi1);

MAX6675 t1sens(&adc1cs,&spi1);
MAX6675 t2sens(&adc2cs,&spi1);
//ADS1118 t56sens(&adc3cs,&spi1);

//extern "C" { void USART1_IRQHandler(void); }
extern "C" { void USART2_IRQHandler(void); }
extern "C" { void EXTI1_IRQHandler(void); }
extern "C" { void EXTI9_5_IRQHandler(void); }
//extern "C" { void EXTI15_10_IRQHandler(void); }
//usart usart1(USART1);
//void USART1_IRQHandler(void)
//  {
//  usart1.IRQHandler();
//  NVIC_ClearPendingIRQ(USART1_IRQn);
//  }
usart usart2(USART2);
void USART2_IRQHandler(void)
  {
  usart2.IRQHandler();
  NVIC_ClearPendingIRQ(USART2_IRQn);
  }

inline void check_pin(gpio_pin * input_pin, int * last_state, unsigned int * counter)
{
  int current_state = input_pin->read();
  if (current_state != (*last_state)) {(*last_state) = current_state; (*counter)++;}
}

void EXTI1_IRQHandler(void)// OPTO2 on J6
{
//  EXTI1_IRQ_cntr++;

  check_pin(&(extfansns[1]), &GPI_A1_state, &extfan2_cntr);
  EXTI->PR = (1<<1);  
  NVIC_ClearPendingIRQ(EXTI1_IRQn);
}

void EXTI9_5_IRQHandler(void)//OPTO1 on J5
{
//  EXTI9_5_IRQ_cntr++;
  
  check_pin(&(extfansns[0]), &GPI_B5_state, &extfan1_cntr);
//  check_pin(&(fansns[0]), &GPI_B8_state, &fan1_cntr);
//  check_pin(&(fansns[1]), &GPI_B9_state, &fan2_cntr);
  EXTI->PR = (1<<5);  
  NVIC_ClearPendingIRQ(EXTI9_5_IRQn);
}

/*void EXTI15_10_IRQHandler(void)//OPTO1 on J5
{
//  EXTI15_10_IRQ_cntr++;

  check_pin(&(fansns[2]), &GPI_C13_state, &fan3_cntr);
  check_pin(&(fansns[3]), &GPI_C14_state, &fan4_cntr);
  check_pin(&(fansns[4]), &GPI_B15_state, &fans_cntr);
  EXTI->PR = (1<<15);
  NVIC_ClearPendingIRQ(EXTI15_10_IRQn);
}*/


ADC<7> adc;
uint8_t adcchannels[7] = {0, 16, 16, 16, 17, 17, 17};
void DMA1_Channel1_IRQHandler(void) {
  adc.IRQHandler();
  NVIC_ClearPendingIRQ(DMA1_Channel1_IRQn);
}

unsigned int OffDelayMs = 0;
unsigned int OnTimeoutMs = 120*1000;
unsigned int StartOffCuuntMs = 0;
unsigned int StartButtonPress = 0;
unsigned int const ButtonStartPoweroffDelayMs = 300;
unsigned int const ACOFF_ERR_IGNORE_TIME_MS = 40000;
bool ACOFF_ERR_NOT_IGNORE = false;
bool POWER_KEY_SWITCH_MODE = false;



//byte serbuf1[128];
byte serbuf2[128];
//itmp_link_serial serlink1(&usart1,serbuf1,sizeof(serbuf1)); // to external ttl usart
itmp_link_serial serlink2(&usart2,serbuf2,sizeof(serbuf2)); // to rs485
itmp_core itmp2;

int itmp_poweroff(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  if (in_len>=1) { // if we need to accept something
    for (int i=0;i<in_len;i++){
      int v = dec.read_int();
      if (i==0){
        OffDelayMs = v*1000;
      }
    } 
  } else OffDelayMs = 500;
  enc.write_arr(1);
  enc.write_int(globalstate);
  return enc.length();
}

int itmp_stat(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  if (in_len>=1) { // if we need to accept something
    for (int i=0;i<in_len;i++){
      int v = dec.read_int();
      if (i==0){
        v = v & GS_RESET_MASK;
        globalstate = globalstate & ~v;
        if (globalstate & GS_STARTING) {
          globalstate &= ~GS_STARTING;
          globalstate |= GS_WORKING;
          lvout[0].set(); // lamp on
          if ((globalstate & GS_POWERKEY)!=0)
            globalstate |= GS_SHUTDOWN_AFTER_RELEASE;
        }
      }
    }
  }
  enc.write_arr(1);
  enc.write_int(globalstate);
  return enc.length();
}

int itmp_setlv(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  for (int i=0;i<in_len;i++){
    int v;
    if (dec.is_bool() ) {
      v = dec.read_bool() ? 1 : 0;
    } else {      
      v = dec.read_int() != 0 ? 1 : 0;
    }
    if (!dec.error()&& (i < lvouts_count)) {
      lvout[i].set(v);
    }
  }
  enc.write_arr(lvouts_count);
  for (int i=0; i < lvouts_count; i++){
    enc.write_int( lvout[i].read());
  }
  return enc.length();
}


int itmp_sethv(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
 
  SN74C595 *SPI_GPO = (&acpower);
  
  if (((globalstate & GS_EMSTOP_ERR)!=0)||((globalstate & GS_OTHER_ERR)!=0)||((globalstate & GS_WORKING)==0)) {return -406;}//низзя включать, если есть ошибки
 
  int in_len=dec.read_arr();

 
  if ( dec.error() ) in_len=0;
  for (int i=0;i<in_len;i++)
  {
    int v;
    if (dec.is_bool()) {
      v = dec.read_bool();
    } else {      
      v = dec.read_int();
    }
    
    if (! dec.error() && i < 8) {
      if (v)
        SPI_GPO->on(i);
      else
        SPI_GPO->off(i);
    }
  }
  if (in_len>0){
    SPI_GPO->set();
  }
  enc.write_arr(8);
  for (int i=0; i < 8; i++){
    int CurentGPIO = SPI_GPO->get(i);
    enc.write_int( CurentGPIO );
  }
  return enc.length();
}

int itmp_get(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  enc.write_arr(5);
  enc.write_int(adc.temperature()/*internal CPU temperature*/);
  enc.write_int(t1sens.getTemperature());
  enc.write_int(t2sens.getTemperature());
  enc.write_int(extfan1_freq);
  enc.write_int(extfansns[1].read()/*GPI_A1_state extfan2_freq*/);
  return enc.length();
  }

int itmp_gett(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  enc.write_arr(5);
  enc.write_int(adc.temperature()/*internal CPU temperature*/);
  enc.write_int(t1sens.getTemperature());
  enc.write_int(t2sens.getTemperature());
  enc.write_int(extfan1_freq);
  enc.write_int(globalstate);
  return enc.length();
  }

int itmp_fansfreq(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  enc.write_arr(2);
  enc.write_int(extfan1_freq);
  enc.write_int(extfan2_freq);

  return enc.length();
}

int itmp_gpi(const char* url, CBOR_decoder& dec, CBOR_encoder& enc, void* data){
  int in_len=dec.read_arr();
  if ( dec.error() ) in_len=0;
  enc.write_arr(2);
  enc.write_int(extfansns[0].read()/*GPI_B5_state extfan1_freq*/);
  enc.write_int(extfansns[1].read()/*GPI_A1_state extfan2_freq*/);
  return enc.length();
}


ITMP_TABLE_START("TMeter{%3.0*300@NSC}:sens")
ITMP_EXPORTN("poweroff", "&`start shutdown`(i`delay_s`)<i`state`>", itmp_poweroff,0)
ITMP_EXPORTN("stat", "&`get state`(i`state`)<i`state`>", itmp_stat,0)
ITMP_EXPORTN("setHV",  "&`set HiVoltage outs`([i`state[0..1]`])<[i`state[0..1]`]>", itmp_sethv,0)
ITMP_EXPORTN("setLV",  "&`set LowVoltage outs`([i`state[0..1]`])<[i`state[0..1]`]>", itmp_setlv,0)
ITMP_EXPORTN("get", "&`get sensors state`()<i`CPU temperature`,i`T1 temperature`,i`T2 temperature`,i`fan_freq`,i`doorstate[0..1]`>", itmp_get,0)
ITMP_EXPORTN("gett", "&`get sensors state`()<i`CPU temperature`,i`T1 temperature`,i`T2 temperature`,i`fan_freq`>", itmp_gett,0)
ITMP_EXPORTN("fansfreq",  "&`get fans frequency`()<[i`freq`]>", itmp_fansfreq,0)
ITMP_EXPORTN("sensors",  "&`get sensor state`()<[i`state[0..1]`]>", itmp_gpi,0)

ITMP_TABLE_END()

//int last_temp;
//signed short int last_temp_frac;

//int dbg_itmpouts[5];
//int dbg_pins[lvouts_count] = {0,0,0,0,0,0};
void ShutdownNow(void)
{//shutdown routine
  globalstate = GS_NOT_INITIALIZED;
  for (int i = 0; i < lvouts_count; i++) lvout[i].reset();
  
  acpower.set(0x0000);

  lvout[3].set();//включи пищалку
  delay(10000);
  lvout[3].reset();
  lvout[0].reset(); // lamp off

  PiON.reset();
}


void main(void) {
  RCC->APB2ENR |= RCC_APB2ENR_AFIOEN;
  AFIO->MAPR = (AFIO->MAPR & ~(AFIO_MAPR_SWJ_CFG_NOJNTRST|AFIO_MAPR_SWJ_CFG_JTAGDISABLE|AFIO_MAPR_SWJ_CFG_DISABLE)) | AFIO_MAPR_SWJ_CFG_JTAGDISABLE;

  sys_init();
    
  //gpio_pin Vin;
  //Vin.acquire(PORTA | PIN0, GPIO_IN_ANALOG);

  gpio_pin ain1(PORTA | PIN0, GPIO_IN_ANALOG);
//  gpio_pin ain2(PORTB | PIN1, GPIO_IN_ANALOG);
  
//  fans[0].acquire(PORTA | PIN8, GPIO_OUT_PUSHPULL_10MHz);
//  fans[1].acquire(PORTA | PIN9, GPIO_OUT_PUSHPULL_10MHz);
//  fans[2].acquire(PORTA | PIN10, GPIO_OUT_PUSHPULL_10MHz);
//  fans[3].acquire(PORTA | PIN11, GPIO_OUT_PUSHPULL_10MHz);
// for driving fans used PWM on TIM...
//  gpio_pin::configure(GPIOA,8,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  gpio_pin::configure(GPIOA,9,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  gpio_pin::configure(GPIOA,10,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  gpio_pin::configure(GPIOA,11,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  gpio_pin::configure(GPIOB,9,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  gpio_pin::configure(GPIOB,15,GPIO_OUT_ALT_PUSHPULL_10MHz);
//  
  lvout[0].acquire(PORTC | PIN14, GPIO_OUT_PUSHPULL_10MHz);//J12 out / old "AMBER"
  lvout[1].acquire(PORTB | PIN15, GPIO_OUT_PUSHPULL_10MHz);//NOT CONNECTED / old "RED"
  lvout[2].acquire(PORTA | PIN9, GPIO_OUT_PUSHPULL_10MHz);//NOT CONNECTED / old "BLUE"
  lvout[3].acquire(PORTA | PIN10, GPIO_OUT_PUSHPULL_10MHz);//BUZZER / old "GREEN"
  lvout[4].acquire(PORTA | PIN11, GPIO_OUT_PUSHPULL_10MHz);// "FAN2"
  lvout[5].acquire(PORTA | PIN8, GPIO_OUT_PUSHPULL_10MHz);// "FAN1"
  lvout[0].set();
  lvout[3].set();

//  fansns[0].acquire(PORTB | PIN8, GPIO_IN_PULLUP);
//  fansns[1].acquire(PORTB | PIN9, GPIO_IN_PULLUP);
//  fansns[2].acquire(PORTC | PIN13, GPIO_IN_PULLUP);
//  fansns[3].acquire(PORTC | PIN14, GPIO_IN_PULLUP);
//  fansns[4].acquire(PORTB | PIN15, GPIO_IN_PULLUP);

  extfansns[0].acquire(PORTB | PIN5, GPIO_IN_PULLUP);
  extfansns[1].acquire(PORTA | PIN1, GPIO_IN_PULLUP);
  
  gpio_pin en485(PORTB | PIN10, GPIO_OUT_PUSHPULL_10MHz);
  
  en485.reset();
  usart2.usart_init(115200);
  usart2.en=&en485;

  adc.begin(adcchannels, 0);// list of channels and supply voltage channel if so

  tim_init();
  
  // --- GPIO interupt init  
    AFIO->EXTICR[0]=(AFIO_EXTICR_EXTI_PA<<4);//A1
    AFIO->EXTICR[1]=(AFIO_EXTICR_EXTI_PB<<4);//B5
  //  AFIO->EXTICR[2]=(AFIO_EXTICR_EXTI_PB<<4) | (AFIO_EXTICR_EXTI_PB);//B9 B8
  //  AFIO->EXTICR[3]=(AFIO_EXTICR_EXTI_PB<<12) | (AFIO_EXTICR_EXTI_PC<<8) | (AFIO_EXTICR_EXTI_PC<<4);//B15 C14 C13
    EXTI->IMR |= /*(1<<15) | (1<<14) | (1<<13) | (1<<9) | (1<<8) |*/ (1<<5) | (1<<1);
    EXTI->RTSR |= /*(1<<15) | (1<<14) | (1<<13) | (1<<9) | (1<<8) |*/ (1<<5) | (1<<1); // rising edge
    EXTI->FTSR |= /*(1<<15) | (1<<14) | (1<<13) | (1<<9) | (1<<8) |*/ (1<<5) | (1<<1); // falling edge

    NVIC_EnableIRQ(EXTI1_IRQn);
    NVIC_EnableIRQ(EXTI9_5_IRQn);
//    NVIC_EnableIRQ(EXTI15_10_IRQn);

  
  
/*  if (dev.board_address==1)
    {
    gpio_pin::configure(GPIOA,10,GPIO_OUT_PUSHPULL_2MHz);
    }
  */

  __enable_irq();
//  flash_init();

//	while (!dma_completed())
//    wdg_reset();

/*  int stored_addr = stor_read_addr(NULL, NULL);
  if ((stored_addr>0)&&(stored_addr<0xff)) {//validate address	
    board_address = stored_addr;
  } else {
    //__flash_unlock();
    // stor_write_addr(7);
  }*/
      
   
  uniqueid[1]='T';
  uniqueid[2]='D';
  uniqueid[3]='M';
  *((int*)(uniqueid+4))=ID->ID2;
  uniqueid[0]=7;

//  board_address = 2;//default 2
  serlink2.set_addr(board_address);
//  itmp2.add_link(&serlink1);
  itmp2.add_link(&serlink2);
  {
  uint32_t id1=ID->ID1;
  uint32_t id2=ID->ID2;
  itmp2.begin(0,(((uint64_t)ID->ID0<<32) ^ id1) ^ id2, ITMP_TOPICS, ITMP_TOPICS_NUM  );
  }
//  timer=get_us();

  
  unsigned int lastCmdTime = get_us();
  unsigned int lastTempTime = get_us();
  unsigned int lastLedTime = get_us();
  unsigned int lastFREQTime = get_us();
  
  
  spi1.begin(1000000,16);
  adc1cs.acquire(PORTB | PIN11, GPIO_OUT_PUSHPULL_10MHz);  adc1cs.set(); // adc 1
  adc2cs.acquire(PORTB | PIN0,  GPIO_OUT_PUSHPULL_10MHz);  adc2cs.set(); // adc 2
//  adc3cs.acquire(PORTA | PIN4,  GPIO_OUT_PUSHPULL_10MHz);  adc3cs.set(); // adc 1
//  stlcs.acquire (PORTB | PIN7,  GPIO_OUT_PUSHPULL_10MHz);  stlcs.set(); // external stacked light
  pwrcs.acquire(PORTB | PIN4,  GPIO_OUT_PUSHPULL_10MHz);  pwrcs.set(); // AC loads
  
//  t12sens.begin();
//  t34sens.begin();
//  t56sens.begin();

//  fans[0].set();//PWM FANs!!!
//  fans[1].set();
//  fans[2].set();
//  fans[3].set();

  PiON.reset();
  gpio_pin Button(PORTA | PIN4, GPIO_IN_FLOATING);//power button 0=pressed 
  gpio_pin EmStop(PORTB | PIN12, GPIO_IN_PULLDOWN);// на старых платах висел в воздухе, если не тянуть в низ, может давать фальшивые сработки. Низкий уровень = обрыв контакта в J9 (там может быть Кн.Авар.Ост и защитное термореле)  
  gpio_pin acoff(PORTA | PIN15, GPIO_IN_FLOATING); //подтянут в схеме к +3.3.  высокий уровень говорит об перегреве в силовой части или разбаланс по фазам
  adc1cs.reset(); // ac enable by setting 0
  
 //  stlpower.set(0x01ff);  
  acpower.set(0x0000);//  setacpower();
  while ((get_us() - lastLedTime) < 100*1000) {;}
//  stlpower.set(0x01E0);  
  
  unsigned int lastACOFFhi = get_ms();  

  unsigned int lastLampTime = get_ms();  
  
  wdg_init_ms(IWDG_PRES_UP_TO_6400ms)
  lvout[3].reset();
  while (1) {
       
    wdg_reset();
    
//    if ((acoff.read() != 0)) 
//      {
////        globalstate |= GS_OTHER_ERR;
//        lastACOFFhi = get_ms();
////        acpower.set(0x0000);
////        lvout[3].set();//включи пищалку
//      }

    
    if (ACOFF_ERR_NOT_IGNORE)
    {
      if (((globalstate & GS_WORKING)!=0) && (acoff.read() != 0)) 
      {
        globalstate |= GS_OTHER_ERR;
        acpower.set(0x0000);
        lvout[3].set();//включи пищалку
      }
    } else if (get_ms() >= ACOFF_ERR_IGNORE_TIME_MS) 
    {
      ACOFF_ERR_NOT_IGNORE = true;
    }

    if ( get_ms() - lastLampTime > 100u){
      if ( (globalstate & GS_STARTING)!=0 || (globalstate & GS_SHUTDOWN)!=0 ) { // if we are not working and button pressed for short time
        lvout[0].toggle(); // lamp flash
      }
      lastLampTime += 100;//= get_ms();
    }
    
    if ((globalstate & GS_WORKING)!=0) 
    {
      if (EmStop.read() == 0)
        {
          globalstate |= GS_EMSTOP_ERR;
          acpower.set(0x0000);
          lvout[3].set();//включи пищалку
        };
    } 
    if (((globalstate & GS_SHUTDOWN)!=0) && (get_ms() - StartOffCuuntMs >= OffDelayMs))
        ShutdownNow();// GS_SHUTDOWN = 1; GS_WORKING = 0; задержка по StartOffCuuntMs и OffDelayMs истекла
    if (((globalstate & GS_STARTING)!=0) && (get_ms() - StartOffCuuntMs >= OnTimeoutMs))
        ShutdownNow();// GS_SHUTDOWN = 1; GS_WORKING = 0; задержка по StartOffCuuntMs и OffDelayMs истекла
    
    if (Button.read() == 0) 
    {//нажата
      if ((globalstate & GS_POWERKEY)==0) 
      {//только нажали
        globalstate |= GS_POWERKEY;
        StartButtonPress = get_ms();
      } else {
        if ( (globalstate & GS_WORKING)==0 && (globalstate & GS_STARTING)==0 && get_ms() - StartButtonPress >= ButtonStartPoweroffDelayMs ) { // if we are not working and button pressed for short time
          globalstate |= GS_STARTING; // start starting procedure
          StartOffCuuntMs=get_ms();
          PiON.set();
          lvout[0].set(); // lamp on
          lvout[3].set();//включи пищалку
          delay(100000);
          lvout[3].reset();//выключи пищалку
        } else if ( (globalstate & GS_SHUTDOWN_AFTER_RELEASE) == 0 && (globalstate & GS_WORKING)!=0 && (globalstate & GS_SHUTDOWN)==0 &&  get_ms()-StartButtonPress >= ButtonStartPoweroffDelayMs ) { // if we are working normally and button pressed for short time
          globalstate |= GS_SHUTDOWN; // next time raspberry pi got this value
          StartOffCuuntMs=get_ms();
          OffDelayMs = 20*1000;
          lvout[0].reset(); // lamp off
          lvout[3].set();//включи пищалку
          delay(100000);
          lvout[3].reset();//выключи пищалку
        }
      }
    } else {//отпущена
      if ((globalstate & GS_POWERKEY)!=0) {//только otжали
        globalstate = globalstate & ~GS_POWERKEY;
        StartButtonPress = get_ms();
      } else {
        if ( (globalstate & GS_SHUTDOWN_AFTER_RELEASE) != 0 && (globalstate & GS_WORKING)!=0 && (globalstate & GS_SHUTDOWN)==0  && (globalstate & GS_STARTING)==0 ) {
          globalstate |= GS_SHUTDOWN;
          StartOffCuuntMs=get_ms();
          OffDelayMs = 20*1000;
          lvout[0].reset(); // lamp off
          lvout[3].set();//включи пищалку
          delay(100000);
          lvout[3].reset();//выключи пищалку
        }
      }
    }
/*
unsigned int const GS_NOT_INITIALIZED = 0;
unsigned int const GS_WORKING = 1;
unsigned int const GS_ITMP_NO_CMD_TIMEOUT = 2;
unsigned int const GS_TSENSOR_ERR = 4;
unsigned int const GS_OVERHEAT = 8;
unsigned int const GS_POWERKEY = 16;
unsigned int const GS_SHUTDOWN = 32;
unsigned int const GS_EMSTOP_ERR = 64;
unsigned int const GS_OTHER_ERR = 128;
unsigned int const GS_RESET_MASK = GS_ITMP_NO_CMD_TIMEOUT | GS_TSENSOR_ERR | GS_OVERHEAT | GS_SHUTDOWN | GS_EMSTOP_ERR | GS_OTHER_ERR;
unsigned int globalstate = GS_NOT_INITIALIZED;
*/

    
    if ((get_us() - lastFREQTime) > 250*1000) 
    {// 4 per second
      extfan1_freq = (extfan1_freq + extfan1_cntr) / 2;
      extfan2_freq = (extfan2_freq + extfan2_cntr) / 2;
      extfan1_cntr = 0;
      extfan2_cntr = 0;
      lastFREQTime = get_us();
    }

    if ((get_us() - lastTempTime) > 500*1000) 
    {
      t1sens.loop();
      t2sens.loop();
      lastTempTime += 500*1000;
    }
    
    if (itmp2.readAndProcess(0) > 0) 
    {
      lastCmdTime = get_us();
    }
    
    if ((get_us() - lastCmdTime) > 3*1000*1000) 
    {
      acpower.set(0x0000);
      globalstate |= GS_ITMP_NO_CMD_TIMEOUT;
      lastCmdTime = get_us();
    }
    
  }
}