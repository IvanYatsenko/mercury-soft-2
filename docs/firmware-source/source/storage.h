
#ifndef __STORAGE_EMBEDDED_H__
#define __STORAGE_EMBEDDED_H__

//#include "ctassert.h"
//#include "types.h"
#include "flash.h"

__packed struct stor_record
{
	/* boot part */
	uint8_t aid;
	uint8_t addr;
	uint8_t chsum; /* aid ^ addr ^ chsum */
	
	/* fw part */
#define STOR_MAGIC      0x01
	uint8_t magic;
};

#define STOR_BEG       	0x08007800ul
#define STOR_END       	0x08007ffful

//ctassert(!(sizeof(struct stor_record) & (sizeof(flash_wrval_t) - 1)), stor_record_properly_aligned);
//ctassert(sizeof(struct stor_record) >= 4, stor_record_minimal_size);

extern int stor_read_addr(uint8_t *aid, uintptr_t *ptr);
extern int stor_write_addr(uint8_t addr);

#endif /* __STORAGE_EMBEDDED_H__ */
