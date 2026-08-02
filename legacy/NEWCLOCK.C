
	#include <stdio.h>
	#include <dos.h>
	#include <conio.h>

	typedef unsigned char       BYTE;
	typedef unsigned short      WORD;
	typedef unsigned long       DWORD;
	typedef unsigned int        UINT;
	#define LOBYTE(w)           ((BYTE)(w))
	#define HIBYTE(w)           ((BYTE)((UINT)(w) >> 8))
	#define LOWORD(l)           ((WORD)(l))
	#define HIWORD(l)           ((WORD)((DWORD)(l) >> 16))



	typedef void interrupt intfunc();
	intfunc *oldclock;

	void setClockTo( unsigned );

	unsigned int far *screen;





	WORD cnt = 0x0099;
	BYTE lin = 0;
	BYTE col = 0;
	BYTE car = 0;


	void interrupt count( void )
	{
		 BYTE msb, lsb;

		 (*oldclock)();
		 setClockTo(cnt);


		 screen[col] = 0x0700 + ('a'+car);
		 car++;
		 if(col<79) col++;
			else col=0;

		 if( cnt <= 0xFFF0 ) cnt+=10;
		     else cnt = 0x0099;

	}




	void setClockTo( unsigned timeout )
	{
		disable();
		outportb( 0x43, 0x34 );
		outportb( 0x40, LOBYTE(timeout) );
		outportb( 0x40, HIBYTE(timeout) );
		enable();
	}



	void main(void)
	{
		int i;

		screen = (unsigned int *) MK_FP( 0xB800, 0x0000 );

		oldclock = (intfunc *)getvect(0x8);
		setvect(0x8, count);

		clrscr();
		getch();

		setvect( 0x8, oldclock );
	}