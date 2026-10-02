
#include <assert.h>
#define assert(q)
//#include "boot/bootvars.h"
#include "storage.h"
//#include "errors.h"

#pragma optimize = none
static int stor_read_addr_at(uintptr_t ptr, uint8_t *aid)
{
	struct stor_record rec;
	
	flash_wrval_t const *fptr = (flash_wrval_t const *)ptr;
	flash_wrval_t *flrec = (flash_wrval_t *)&rec;
	for (size_t i = 0; i < sizeof(rec) / sizeof(flash_wrval_t); i++)
		flrec[i] = flash_force_read(fptr + i);
	
	uint8_t const rchsum = rec.aid ^ rec.addr ^ 0xa5;
	uint8_t const chsum  = rec.chsum;
	if (rchsum != chsum)
		return -EINVAL;
	
	if (aid != NULL)
		*aid = rec.aid;
	return rec.addr;
}

int stor_read_addr(uint8_t *retaid, uintptr_t *retptr)
{
	/* check addr id */
	int last_addr = -EINVAL;
	uint8_t aid_min = 0xff, aid_max = 0x00;
	
	for (uintptr_t saddr = STOR_BEG; saddr < STOR_END + 1; saddr += FLASH_PAGE_SIZE)
	{
		uint8_t aid;
		int ret = stor_read_addr_at(saddr, &aid);
		if (ret < 0)
			continue;
		
		if (aid < aid_min)
			aid_min = aid;
		if (aid > aid_max)
			aid_max = aid;
		last_addr = ret;
	}
	if (last_addr < 0)
		return last_addr;
	
	/* seek actual */
	int diff = aid_max - aid_min;
	int threshold = 128;
	bool ovf = diff >= threshold;
	
	int abs_aid_max = -1;
	int addr = -EINVAL;
	uintptr_t ptr = 0;
	
	for (uintptr_t saddr = STOR_BEG; saddr < STOR_END + 1; saddr += FLASH_PAGE_SIZE)
	{
		uint8_t aid;
		int ret = stor_read_addr_at(saddr, &aid);
		if (ret < 0)
			continue;
		
		int abs_aid = aid;
		if (ovf && aid > threshold)
			abs_aid += 256;
		if (abs_aid > abs_aid_max)
		{
			addr = ret;
			ptr = saddr;
			abs_aid_max = abs_aid;
		}
	}
	
	if (retaid != NULL)
		*retaid = abs_aid_max;
	if (retptr != NULL)
		*retptr = ptr;
	return addr;
}

static int stor_write_addr_at(uintptr_t ptr, uint8_t addr, uint8_t aid)
{
	struct stor_record rec =
	{
		.aid   = aid,
		.addr  = addr,
		.chsum = aid ^ addr ^ 0xa5,
		.magic = STOR_MAGIC,
	};
	
	/* try write */
	flash_wrval_t const * const fptr = (flash_wrval_t const *)ptr;
	
	int ret = __flash_erase(fptr);
	if (ret < 0 || !flash_isclr_aligned(fptr, FLASH_PAGE_SIZE))
		assert(false);
	
	ret = __flash_progmem(fptr, (flash_wrval_t const *)&rec, sizeof(rec));
	if (ret < 0)
		assert(false);
	
	/* check */
	uint8_t raid;
	ret = stor_read_addr_at(ptr, &raid);
	if (ret != addr || aid != raid)
		return -EHWFAIL;
	
	return 0;
}

static inline uintptr_t saddr_inc(uintptr_t saddr)
{
	saddr += FLASH_PAGE_SIZE;
	if (saddr >= STOR_END + 1)
		saddr = STOR_BEG;
	return saddr;
}

int stor_write_addr(uint8_t addr)
{
	/* get last actual */
	uint8_t aid;
	uintptr_t saddr;
	int ret = stor_read_addr(&aid, &saddr);
	if (ret < 0)
	{
		/* first record */
		aid = 0;
		saddr = STOR_BEG;
	}
	else
	{
		/* next record */
		aid += 1;
		saddr = saddr_inc(saddr);
	}
	
	/* write anywhere */
	size_t const att_max = (STOR_END + 1 - STOR_BEG) / FLASH_PAGE_SIZE;
	for (size_t i = 0; i < att_max; i++)
	{
		ret = stor_write_addr_at(saddr, addr, aid);
		if (!ret)
			return 0;
		
		saddr = saddr_inc(saddr);
	}
	return -EHWFAIL;
}
