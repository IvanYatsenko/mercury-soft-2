
//#include <assert.h>
#include "stm32f10x.h"
#include "flash.h"
//#include "errors.h" //moved to flash.h
#include "sys.h"

int flash_poll(void)
{
	for (uint32_t poll = 0; poll < 0x100000; poll++)
	{
		wdg_reset();
		if (!(FLASH->SR & FLASH_SR_BSY))
			return 0;
	}
	return -EBUSY;
}

static uint32_t const flash_unlock_key1 = 0x45670123;
static uint32_t const flash_unlock_key2 = 0xcdef89ab;

void __flash_unlock(void)
{
	/* this magic constants unlocks flash memory interface */
	FLASH->KEYR = flash_unlock_key1;
	FLASH->KEYR = flash_unlock_key2;
}

int __flash_lock(void)
{
	int ret = flash_poll();
	if (ret)
		return ret;
	
	__flash_clrregs();
	FLASH->CR |= FLASH_CR_LOCK;
	return 0;
}

bool flash_islocked(void)
{
	return FLASH->CR & FLASH_CR_LOCK;
}


int flash_init(void)
{
	FLASH->CR = FLASH_CR_LOCK /* because this bit can be set only */;
	
	/* ok, try to unlock */
	int ret = flash_poll();
	if (ret)
		return ret;
	if (flash_islocked())
		__flash_unlock();
	
	/* check that all fine */
	ret = flash_poll();
	if (ret)
		return ret;
	if (flash_islocked())
		return -EHWFAIL;
	return 0;
}

/* __must__ be called __after__ programming / erasing and __before__ clearing
   status register */
int __flash_get_iopstate(void)
{
	uint32_t sr = FLASH->SR;
	
	if (sr & FLASH_SR_BSY)
		/* before this operation __must__ be called flash_poll(),
		   this is internal bug or stack overflow or other fatal shit */
		return -EINVAL;
	
	if (sr & FLASH_SR_PGERR)
		/* write attemption to non-clear (0xffff) block,
		   unsupported operation */
		return -EFAULT;
	if (sr & FLASH_SR_WRPRTERR)
		/* well... */
		return -EWRPROT;
	if (!(sr & FLASH_SR_EOP))
		/* unbelievable! apocalypse of program */
		return -EINVAL;
	
	/* done */
	return 0;
}

void __flash_clrregs(void)
{
	/* clr known status bits */
	FLASH->SR = FLASH_SR_PGERR | FLASH_SR_WRPRTERR | FLASH_SR_EOP;
	/* clr all control flags except protection options */
	FLASH->CR &= FLASH_CR_OPTWRE | FLASH_CR_LOCK;
}

int __flash_prog(flash_wrval_t const *addr, flash_wrval_t val)
{
	int ret;
	
	if ((uintptr_t)addr & (sizeof(*addr) - 1))
		/* wrong alignment */
		return -EINVAL;
	
	/* wait while iap module is busy */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* prepare registers and choose operation */
	__flash_clrregs();
	FLASH->CR |= FLASH_CR_PG;
	
	/* write to flash address, iap is listening memory bus to perform
	   'burning' at interested address */
	wdg_reset();
	*(flash_wrval_t volatile *)addr = val;
	wdg_reset();

	/* wait while operation is pending */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* get result code and switch off all programming features to suppress
	   undesirable writings to flash memory (example, at NULL address) */
	ret = __flash_get_iopstate();
	__flash_clrregs();
	return ret;
}

int __flash_progmem(flash_wrval_t const *addr, flash_wrval_t const *data, size_t size)
{
	if (size & (sizeof(*addr) - 1))
		/* wrong, not aligned size */
		return -EINVAL;
	
	for (size_t i = 0; i < size / sizeof(*addr); i++)
	{
		int ret = __flash_prog(addr + i, data[i]);
		if (ret)
			return ret;
	}
	return 0;
}

int __flash_erase(flash_wrval_t const *base_addr)
{
	int ret;
	
	if ((uintptr_t)base_addr & (FLASH_PAGE_SIZE - 1))
		/* wrong alignment */
		return -EINVAL;
	
	/* wait while iap module is busy */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* prepare registers */
	__flash_clrregs();
	
	/* tell to iap interested address and start erasing */
	wdg_reset();
	FLASH->CR |= FLASH_CR_PER;
	FLASH->AR = (uintptr_t)base_addr;
	FLASH->CR |= FLASH_CR_STRT;
	wdg_reset();

	/* wait while operation is pending */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* get result code and switch off all programming features to suppress
	   undesirable writings to flash memory (example, at NULL address) */
	ret = __flash_get_iopstate();
	__flash_clrregs();
	return ret;
}

/* suicide */
int __flash_mass_erase(void)
{
	int ret;
	
	/* wait while iap module is busy */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* prepare registers */
	__flash_clrregs();
	
	/* start erasing! */
	wdg_reset();
	FLASH->CR |= FLASH_CR_MER;
	FLASH->AR = FLASH_ADDR;
	FLASH->CR |= FLASH_CR_STRT;
	wdg_reset();

	/* wait while operation is pending */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* get result code and switch off all programming features to suppress
	   undesirable writings to flash memory (example, at NULL address) */
	ret = __flash_get_iopstate();
	__flash_clrregs();
	return ret;
}

bool flash_isclr_aligned(flash_wrval_t const *addr, size_t size)
{
	for (size_t i = 0; i < size / sizeof(*addr); i++)
	{
		if (addr[i] != (flash_wrval_t)-1)
			return false;
	}
	return true;
}

#if 0
void __flashopt_unlock(void)
{
	/* this magic constants unlocks option bytes of flash memory interface */
	FLASH->OPTKEYR = flash_unlock_key1;
	FLASH->OPTKEYR = flash_unlock_key2;
}

int __flashopt_lock(void)
{
	int ret = flash_poll();
	if (ret)
		return ret;
	
	__flash_clrregs();
	FLASH->CR &= ~FLASH_CR_OPTWRE;
	return 0;
}

bool flashopt_islocked(void)
{
	return !(FLASH->CR & FLASH_CR_OPTWRE);
}

int __flashopt_erase(void)
{
	int ret;
	
	/* wait while iap module is busy */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* prepare registers for operation */
	__flash_clrregs();
	if (flashopt_islocked())
		__flashopt_unlock();
	if (flashopt_islocked())
		return -EHWFAIL;
	
	/* start! */
	wdg_reset();
	FLASH->CR |= FLASH_CR_OPTER;
	FLASH->CR |= FLASH_CR_STRT;
	wdg_reset();

	/* wait while operation is pending */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* get result code and switch off all programming features to suppress
	   undesirable writings to flash memory (example, at NULL address) */
	ret = __flash_get_iopstate();
	__flash_clrregs();
	__flashopt_lock();
	return ret;
}

int __flashopt_prog(uintptr_t optptr, uint8_t val)
{
	int ret;
	
	/* wait while iap module is busy */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* prepare registers for operation */
	__flash_clrregs();
	if (flashopt_islocked())
		__flashopt_unlock();
	if (flashopt_islocked())
		return -EHWFAIL;
	
	/* start! */
	wdg_reset();
	FLASH->CR |= FLASH_CR_OPTPG;
	*(uint16_t volatile *)optptr = val;
	wdg_reset();

	/* wait while operation is pending */
	ret = flash_poll();
	if (ret)
		return ret;
	
	/* get result code and switch off all programming features to suppress
	   undesirable writings to flash memory (example, at NULL address) */
	ret = __flash_get_iopstate();
	__flash_clrregs();
	__flashopt_lock();
	return ret;
}

int __flashopt_get(uintptr_t optptr)
{
	uint16_t v16 = *(uint16_t const volatile *)optptr;
	uint8_t v8 = v16, cv8 = ~(v16 >> 8);
	
	if (v8 != cv8)
		return -EFAULT;
	return v8;
}


bool __flashopt_isblank(void)
{
	for (size_t i = 0; i < 8; i++)
	{
		uint16_t val = *(uint16_t volatile *)(FLASH_OPT_BASE + i * 2);
		if (val != 0xffff)
			return false;
	}
	return true;
}

void __flashopt_simply_check(uint32_t optreg)
{
	uint32_t const obr_mask = FLASH_OBR_RDPRT | FLASH_OBR_WDG_SW
			| FLASH_OBR_nRST_STOP | FLASH_OBR_nRST_STDBY;
	
	uint32_t const obr = FLASH->OBR;
	uint32_t const req_obr = optreg;
	
	if (obr & FLASH_OBR_OPTERR || ((obr & obr_mask) != req_obr))
	{
		if (__flashopt_erase())
			assert(false);
		if (!__flashopt_isblank())
			assert(false);
		
		/* set user bits */
		uint8_t const user = (req_obr & (FLASH_OBR_WDG_SW
				| FLASH_OBR_nRST_STOP | FLASH_OBR_nRST_STDBY)) >> 2;
		if (__flashopt_prog(FLASH_OPT_USER, user))
			assert(false);
		if (__flashopt_get(FLASH_OPT_USER) != user)
			assert(false);
		
		/* switch off read protection */
		if (!(req_obr & FLASH_OBR_RDPRT))
		{
			/* ...mass erase */
			uint8_t const rdptr_magic = 0xa5;
			if (__flashopt_prog(FLASH_OPT_USER, rdptr_magic))
				assert(false);
			if (__flashopt_get(FLASH_OPT_USER) != rdptr_magic)
				assert(false);
		}
	}
}


uint32_t volatile flash_prog_err_cnt = 0;
uint32_t volatile flash_write_err_cnt = 0;

void FLASH_IRQHandler(void)
{
	if (FLASH->SR & FLASH_SR_EOP)
	{
		/* Good! */
	}
	
	if (FLASH->SR & FLASH_SR_PGERR)
		flash_prog_err_cnt++;
	
	if (FLASH->SR & FLASH_SR_WRPRTERR)
		flash_write_err_cnt++;
	
	FLASH->SR |= FLASH_SR_WRPRTERR | FLASH_SR_PGERR | FLASH_SR_EOP;
}
#endif
