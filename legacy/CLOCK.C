
	#include <dos.h>
	#include <conio.h>
	#include "datatype.h"
	#include "colors.h"


	typedef void interrupt intfunc();
	intfunc *oldclock;

	void setClockTo( unsigned );

	unsigned int far *screen;





	WORD cnt = 0x0099;
	BYTE lin = 0;
	BYTE col = 0;
	BYTE car = 0xB0;


	void interrupt count( void )
	{
		 BYTE msb, lsb;

		 (*oldclock)();
		 setClockTo(cnt);

		 screen[col] = WHITE FOREGROUND + BLACK BACKGROUND + car;
		 if(col<79) col++;
			else
			{
				col=0;
				if( car == 0xB0 ) car = 0xB2;
				    else car = 0xB0;
			}

		 if( cnt <= 0xFFF0 ) cnt+=0x00FF;
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