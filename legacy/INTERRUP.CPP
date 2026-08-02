
	#include <stdio.h>
	#include <dos.h>
	#include <conio.h>

	#define ROWS 	25
	#define COLUMNS 80
	#define DEPTH   2

	void interrupt (*oldclock)(...);

	unsigned char far* screen;

	unsigned cnt = 0;



	void interrupt count( ... )
	{
		 (*oldclock)();
		 enable();

		 cnt++;

		 screen[0*COLUMNS+2] = (cnt/1000)+'0';
		 screen[0*COLUMNS+4] = ((cnt/100)%10)+'0';
		 screen[0*COLUMNS+6] = ((cnt/10)%10)+'0';
		 screen[0*COLUMNS+8] = (cnt%10)+'0';

	}


	void setclock( void )
	{
		disable();
		outportb( 0x43, 0x34 );
		outportb( 0x40, 0x11 );
		outportb( 0x40, 0x11 );
		enable();
	}

	void resetclock( void )
	{
		disable();
		outportb( 0x43, 0x34 );
		outportb( 0x40, 0xFF );
		outportb( 0x40, 0xFF );
		enable();
	}



	void main(void)
	{
		screen = ( unsigned char far*) MK_FP( 0xB800, 0x0000 );

		oldclock =  getvect(0x8);
		setvect(0x8, count);

		clrscr();
		getch();
		setclock();
		getch();
		resetclock();
		getch();

		setvect( 0x8, oldclock );
	}