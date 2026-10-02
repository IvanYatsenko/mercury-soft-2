#ifndef ADS1118_hpp
#define ADS1118_hpp

#include <stdint.h>
#include "drivers/gpio-alloc.h"
#include "drivers/spi.h"

/**
* Union representing the "config register" in 3 ways: 
* bits, word (16 bits) and nibbles (4 bits)
* (See the datasheet [1] for more information)
*/
///Union configuration register
union Config {
	///Structure of the config register of the ADS1118. (See datasheet [1])
	struct {					
		uint8_t reserved:1;    	///< "Reserved" bit
		uint8_t noOperation:2; 	///< "NOP" bits
		uint8_t pullUp:1;	   	///< "PULL_UP_EN" bit	
		uint8_t sensorMode:1;  	///< "TS_MODE" bit	
		uint8_t rate:3;		   	///< "DR" bits
		uint8_t operatingMode:1;///< "MODE" bit		
		uint8_t pga:3;			///< "PGA" bits
		uint8_t mux:3;			///< "MUX" bits
		uint8_t singleStart:1;  ///< "SS" bit
	} bits;
	uint16_t word;				///< Representation in word (16-bits) format
};


/**
 * Class representing the ADS1118 sensor chip
 * @author Alvaro Salazar <alvaro@denkitronik.com>
 */
class ADS1118 {
  public:
    signed short T1,T2,Tint;

    ADS1118(gpio_pin* io_pin_cs, spi *_spi_){
      cs = io_pin_cs;
      _spi = _spi_;
      LoopCounter=0;			///< Last sensor mode selected (ADC_MODE or TEMP_MODE or none)
    } 		///< Constructor
    void begin(){
//pinMode(cs, OUTPUT);
//	digitalWrite(cs, HIGH);
//    pSpi->begin();
      configRegister.bits.reserved = RESERVED;
      configRegister.bits.noOperation = VALID_CFG; 	///< "NOP" bits
      configRegister.bits.pullUp = DOUT_NO_PULLUP; //DOUT_PULLUP;	   	///< "PULL_UP_EN" bit	
      configRegister.bits.sensorMode = TEMP_MODE; //ADC_MODE; // 	///< "TS_MODE" bit	
      configRegister.bits.rate = RATE_8SPS;		   	///< "DR" bits
      configRegister.bits.operatingMode =  SINGLE_SHOT; //CONTINUOUS;// ///< "MODE" bit		
      configRegister.bits.pga = FSR_0256; //FSR_2048;//			///< "PGA" bits
      configRegister.bits.mux = DIFF_0_1;			///< "MUX" bits
      configRegister.bits.singleStart = START_NOW;  ///< "SS" bit
    }						///< This method initialize the SPI port and the config register
    void begin(uint8_t sclk, uint8_t miso, uint8_t mosi);	///< This method initialize the SPI port and the config register
    void loop(){
      switch (LoopCounter){
      case 0: // read internal thermosensor start to measure termocouple 1 
        configRegister.bits.mux = DIFF_0_1;
        configRegister.bits.sensorMode = ADC_MODE; // 	///< "TS_MODE" bit	
        break;
      case 1: // read termocouple 1 start to measure termocouple 2
        configRegister.bits.mux = DIFF_2_3;
        configRegister.bits.sensorMode = ADC_MODE; ///< "TS_MODE" bit	
        break;
      case 2: // read termocouple 2 start to measure internal thermosensor 
        configRegister.bits.mux = DIFF_0_1;
        configRegister.bits.sensorMode = TEMP_MODE; //ADC_MODE; // 	///< "TS_MODE" bit	
        break;
      }
      
      cs->reset();
      signed short data = _spi->fast_transfer(configRegister.word);
      unsigned short config = _spi->fast_transfer(configRegister.word);
      cs->set();

      switch (LoopCounter){
      case 0: Tint=data>>2; break;
      case 1: T2=data; break; // due to swap channels T1 and T2
      case 2: T1=data; break;
      }
      LoopCounter++;
      if (LoopCounter>=3) LoopCounter=0;
    }

    int getTemperature(){			///< Getting the temperature in degrees celsius from the internal sensor of the ADS1118
      uint16_t data;//, config;
//      if(configRegister.bits.sensorMode != TEMP_MODE)
//        configRegister.bits.sensorMode = TEMP_MODE; //Sorry but we will have to read twice the sensor

      cs->reset();
      data = _spi->fast_transfer(configRegister.word);
      /*config = */_spi->fast_transfer(configRegister.word);
      cs->set();
//      for(int i=0;i<CONV_TIME[configRegister.bits.rate];i++) //Lets wait the conversion time
//              delayMicroseconds(1000);

      //    DEBUG_GETTEMPERATURE(configRegister);  //Debug this method: print the config register in the Serial port
//      if((data<<2) >= 0x8000){
//        data=((~data)>>2)+1; //Converting to right-justified and applying binary twos complement format
//        return data;//(double)(convRegister*0.03125*-1);
//      }
      return data;//(double)convRegister*0.03125;
    }

uint16_t getADCValue(uint8_t inputs);					///< Getting a sample from the specified input
		bool getADCValueNoWait(uint8_t pin_drdy, uint16_t &value);
		bool getMilliVoltsNoWait(uint8_t pin_drdy, double &volts); ///< Getting the millivolts from the settled inputs
        double getMilliVolts(uint8_t inputs);					///< Getting the millivolts from the specified inputs
		double getMilliVolts();				///< Getting the millivolts from the settled inputs
        void decodeConfigRegister(union Config configRegister);	///< Decoding a configRegister structure and then print it out to the Serial port
		void setSamplingRate(uint8_t samplingRate);				///< Setting the sampling rate specified in the config register
		void setFullScaleRange(uint8_t fsr);///< Setting the full scale range in the config register
		void setContinuousMode();			///< Setting to continuous adquisition mode
		void setSingleShotMode();			///< Setting to single shot adquisition and power down mode
		void disablePullup();				///< Disabling the internal pull-up resistor of the DOUT pin
		void enablePullup();				///< Enabling the internal pull-up resistor of the DOUT pin
		void setInputSelected(uint8_t input);///< Setting the inputs to be adquired in the config register.
		//Input multiplexer configuration selection for bits "MUX"
			//Differential inputs
        static const uint8_t DIFF_0_1 	  = 0x00; 	///< Differential input: Vin=A0-A1
	static const uint8_t DIFF_0_3 	  = 0x01; 	///< Differential input: Vin=A0-A3
	static const uint8_t DIFF_1_3 	  = 0x02; 	///< Differential input: Vin=A1-A3
        static const uint8_t DIFF_2_3 	  = 0x03; 	///< Differential input: Vin=A2-A3   
			//Single ended inputs
        static const uint8_t AIN_0 	  = 0x04;  ///< Single ended input: Vin=A0
        static const uint8_t AIN_1		  = 0x05;	///< Single ended input: Vin=A1
        static const uint8_t AIN_2 	  = 0x06;	///< Single ended input: Vin=A2
        static const uint8_t AIN_3 	  = 0x07;	///< Single ended input: Vin=A3
        union Config configRegister;        ///< Config register

        //Bit constants
	static const uint32_t SCLK       = 2000000;///< ADS1118 SCLK frequency: 4000000 Hz Maximum for ADS1118
		
		// Used by "SS" bit
	static const uint8_t START_NOW   = 1;      ///< Start of conversion in single-shot mode
		
		// Used by "TS_MODE" bit
	static const uint8_t ADC_MODE    = 0;      ///< External (inputs) voltage reading mode
	static const uint8_t TEMP_MODE   = 1;      ///< Internal temperature sensor reading mode
		
		// Used by "MODE" bit
	static const uint8_t CONTINUOUS  = 0;      ///< Continuous conversion mode
	static const uint8_t SINGLE_SHOT = 1;      ///< Single-shot conversion and power down mode
		
		// Used by "PULL_UP_EN" bit
	static const uint8_t DOUT_PULLUP      = 1;      ///< Internal pull-up resistor enabled for DOUT ***DEFAULT
	static const uint8_t DOUT_NO_PULLUP   = 0;      ///< Internal pull-up resistor disabled
		
		// Used by "NOP" bits
	static const uint8_t VALID_CFG   = 0x01;   ///< Data will be written to Config register
	static const uint8_t NO_VALID_CFG= 0x00;   ///< Data won't be written to Config register
		
		// Used by "Reserved" bit
	static const uint8_t RESERVED    = 1;      ///< Its value is always 1, reserved

        /*Full scale range (FSR) selection by "PGA" bits. 
		 [Warning: this could increase the noise and the effective number of bits (ENOB). See tables above]*/
        static const uint8_t FSR_6144    = 0x00;  ///< Range: ±6.144 v. LSB SIZE = 187.5?V
        static const uint8_t FSR_4096    = 0x01;  ///< Range: ±4.096 v. LSB SIZE = 125?V
        static const uint8_t FSR_2048    = 0x02;  ///< Range: ±2.048 v. LSB SIZE = 62.5?V ***DEFAULT
        static const uint8_t FSR_1024    = 0x03;  ///< Range: ±1.024 v. LSB SIZE = 31.25?V
        static const uint8_t FSR_0512    = 0x04;  ///< Range: ±0.512 v. LSB SIZE = 15.625?V
        static const uint8_t FSR_0256    = 0x07;  ///< Range: ±0.256 v. LSB SIZE = 7.8125?V

        /*Sampling rate selection by "DR" bits. 
		[Warning: this could increase the noise and the effective number of bits (ENOB). See tables above]*/
        static const uint8_t RATE_8SPS   = 0x00;  ///< 8 samples/s, Tconv=125ms
        static const uint8_t RATE_16SPS  = 0x01;  ///< 16 samples/s, Tconv=62.5ms
        static const uint8_t RATE_32SPS  = 0x02;  ///< 32 samples/s, Tconv=31.25ms
        static const uint8_t RATE_64SPS  = 0x03;  ///< 64 samples/s, Tconv=15.625ms
        static const uint8_t RATE_128SPS = 0x04;  ///< 128 samples/s, Tconv=7.8125ms
        static const uint8_t RATE_250SPS = 0x05;  ///< 250 samples/s, Tconv=4ms
        static const uint8_t RATE_475SPS = 0x06;  ///< 475 samples/s, Tconv=2.105ms
        static const uint8_t RATE_860SPS = 0x07;  ///< 860 samples/s, Tconv=1.163ms	
		
private:
    spi *_spi;
    uint8_t LoopCounter;			///< Last sensor mode selected (ADC_MODE or TEMP_MODE or none)
    gpio_pin* cs;                         ///< Chip select pin (choose one)		
		//static const float pgaFSR[8] = {6.144, 4.096, 2.048, 1.024, 0.512, 0.256, 0.256, 0.256};
		//static const uint8_t CONV_TIME[8]={125, 63, 32, 16, 8, 4, 3, 2}; 	///< Array containing the conversions time in ms

/*
							Table 1. Noise in ?VRMS (?VPP) at VDD = 3.3 V   [1]
								DATA RATE FSR (Full-Scale Range)
  (SPS) ±6.144 V 		±4.096 V 	 ±2.048 V 		±1.024 V 		±0.512 V 		±0.256 V
	8 	187.5 (187.5) 	125 (125) 	 62.5 (62.5) 	31.25 (31.25) 	15.62 (15.62) 	7.81 (7.81)
	16 	187.5 (187.5) 	125 (125) 	 62.5 (62.5) 	31.25 (31.25) 	15.62 (15.62) 	7.81 (7.81)
	32 	187.5 (187.5) 	125 (125) 	 62.5 (62.5) 	31.25 (31.25) 	15.62 (15.62) 	7.81 (7.81)
	64 	187.5 (187.5) 	125 (125) 	 62.5 (62.5) 	31.25 (31.25) 	15.62 (15.62) 	7.81 (7.81)
	128 187.5 (187.5) 	125 (125) 	 62.5 (62.5) 	31.25 (31.25) 	15.62 (15.62) 	7.81 (12.35)
	250 187.5 (252.09) 	125 (148.28) 62.5 (84.03) 	31.25 (39.54) 	15.62 (16.06) 	7.81 (18.53)
	475 187.5 (266.92) 	125 (227.38) 62.5 (79.08) 	31.25 (56.84) 	15.62 (32.13) 	7.81 (25.95)
	860 187.5 (430.06) 	125 (266.93) 62.5 (118.63) 	31.25 (64.26) 	15.62 (40.78) 	7.81 (35.83)
	
			Table 2. ENOB from RMS Noise (Noise-Free Bits from Peak-to-Peak Noise) at VDD = 3.3 V
								DATA RATE FSR (Full-Scale Range)
  (SPS) 	±6.144 V 	±4.096 V 	 ±2.048 V 		±1.024 V 		±0.512 V 		±0.256 V
	8 		16 (16) 	16 (16) 	 16 (16) 		16 (16) 		16 (16) 		16 (16)
	16 		16 (16) 	16 (16) 	 16 (16) 		16 (16) 		16 (16) 		16 (16)
	32 		16 (16) 	16 (16) 	 16 (16) 		16 (16) 		16 (16) 		16 (16)
	64 		16 (16) 	16 (16) 	 16 (16) 		16 (16) 		16 (16) 		16 (16)
	128 	16 (16) 	16 (16) 	 16 (16) 		16 (16) 		16 (16) 		16 (15.33)
	250 	16 (15.57) 	16 (15.75) 	 16 (15.57) 	16 (15.66) 		16 (15.96) 		16 (14.75)
	475 	16 (15.49) 	16 (15.13) 	 16 (15.66)  	16 (15.13) 		16 (14.95) 		16 (14.26)
	860 	16 (14.8) 	16 (14.9) 	 16 (15.07) 	16 (14.95) 		16 (14.61) 		16 (13.8)
	
	
	[1] Texas Instruments, "ADS1118 Ultrasmall, Low-Power, SPI™-Compatible, 16-Bit Analog-to-Digital 
	Converter with Internal Reference and Temperature Sensor", ADS1118 datasheet, SBAS457E [OCTOBER 2010–REVISED OCTOBER 2015]. 
	
	Note: This information is taken from http://www.ti.com
	      Copyright © 2010–2015, Texas Instruments Incorporated
*/		

};

#endif