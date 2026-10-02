
#ifndef __IAP_FLASH_H__
#define __IAP_FLASH_H__

#include <stddef.h>
//#include <stdbool.h>
#include <stdint.h>



#define FLASH_ADDR			0x08000000ul
#define FLASH_PAGE_SIZE			0x400ul
typedef uint16_t flash_wrval_t;
#define FLASH_WRITE_BLOCK_SIZE		sizeof(flash_wrval_t)
#define FLASH_BLOCKS_PER_PAGE		(FLASH_PAGE_SIZE / FLASH_WRITE_BLOCK_SIZE)

extern int flash_poll(void);

extern void __flash_unlock(void);
extern int __flash_lock(void);
extern bool flash_islocked(void);

extern int flash_init(void);

extern int __flash_get_iopstate(void);
extern void __flash_clrregs(void);

extern int __flash_prog(flash_wrval_t const *addr, flash_wrval_t val);
extern int __flash_progmem(flash_wrval_t const *addr, flash_wrval_t const *data, size_t size);
extern int __flash_erase(flash_wrval_t const *base_addr);
extern int __flash_mass_erase(void);
extern bool flash_isclr_aligned(flash_wrval_t const *addr, size_t size);

/* just prog / erase, but @opterr and @rdprt flags must be checked independently */
#if 0
extern void __flashopt_unlock(void);
extern int __flashopt_lock(void);
extern bool flashopt_islocked(void);

extern int __flashopt_erase(void);
extern int __flashopt_prog(uintptr_t optptr, uint8_t val);
extern int __flashopt_get(uintptr_t optptr);
extern bool __flashopt_isblank(void);
extern void __flashopt_simply_check(uint32_t optreg); /* check & set @user & @rdptr (all except @wrptr & @data) */
#endif


/* force constant reading operation in @addr, this prevents optimization */
static inline flash_wrval_t flash_force_read(flash_wrval_t const *addr)
{
	return *(flash_wrval_t volatile const *)addr;
}

/* Error codes*/

#define EINVAL				1
#define EBUSY				2
#define EFAULT				3
#define EHWFAIL				4
#define ENOMEM				5
#define EWRPROT				6

#endif /* __IAP_FLASH_H__ */
