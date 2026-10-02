#ifndef SN74C595_hpp
#define SN74C595_hpp

#include <stdint.h>
#include "drivers/gpio-alloc.h"
#include "drivers/spi.h"

class SN74C595 {
private:
    spi *_spi;
//    uint8_t LoopCounter;			///< Last sensor mode selected (ADC_MODE or TEMP_MODE or none)
    gpio_pin* cs;                         ///< Chip select pin (choose one)
    unsigned int WritedBuffer;
    int Buffer;

  public:
    signed short T1,T2,Tint;

    SN74C595(gpio_pin* io_pin_cs, spi *_spi_, int buff=0){
      cs = io_pin_cs;
      _spi = _spi_;
      Buffer = buff;
    } 		///< Constructor
    
  void set(int buff=-1) {
  if ( buff == -1) {
    buff = Buffer;
  } else {Buffer = buff;}
  cs->reset();
  _spi->fast_transfer( buff );
  cs->set();
  WritedBuffer = buff;
}

void on(int index) {
  Buffer |= 1 << (index+1);
}

void off(int index) {
  Buffer &= ~(1 << (index+1));
}

int get(int index=-1){
  if ( index == -1) {
    return Buffer;
  }
  return (Buffer >> (index+1)) & 0x01;
    
};

};
#endif //SN74C595_hpp 