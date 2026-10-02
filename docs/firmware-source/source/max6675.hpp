#ifndef MAX6675_hpp
#define MAX6675_hpp

#include <stdint.h>
#include "drivers/gpio-alloc.h"
#include "drivers/spi.h"

/**
 * Class representing the MAX6675 sensor chip
 */
class MAX6675 {
  public:
    unsigned short data;

    MAX6675(gpio_pin* io_pin_cs, spi *_spi_){
      cs = io_pin_cs;
      _spi = _spi_;
    } 		///< Constructor
    
    void loop(){
      cs->reset();
      data  = _spi->fast_transfer(0);
      cs->set();
    }

    unsigned short int getTemperature(){			///< Getting the temperature in degrees celsius 
#define Is_Termocouple_Open 0x04      
      if (data & Is_Termocouple_Open != 0) return -1;
      return data>>3;
    }
		
private:
    spi *_spi;
    gpio_pin* cs;                         ///< Chip select pin (choose one)		

};

#endif