#include <stdlib.h>
#include <stdio.h>
#include <conio.h>
#include <dos.h>
#include <mem.h>
#include <ctype.h>
#include <string.h>
#include "datatype.h"
#include "rtc86.h"
#include "colors.h"

#define	MAX_COL		80
#define	MAX_LIN		25
#define	MAX_VALUE	100
#define	STARTX		30
#define NRUNITS		4
#define	PG_DN		0x51

typedef unsigned char screen_type[25][80][2];
screen_type	far	*screen;
 BOOL	bScreenStatus 	=	FALSE;
 BOOL	bGraphicsStatus	=	ON;
 BOOL	bViewLogFile	=	OFF;
 FILE	*file;

 char	messageWATTHIGH[] 	= "Active power exceeds limit .";
 char	messageKVARHIGH[] 	= "Reactive power exceeds limit .";
 char	messageAHIGH[]    	= "Power stream exceeds limit.";
 char	messageVHIGH[]		= "Voltage exceeds limit.";
 char	messageCURRVAL[] 	= "Current value is ";

_declare( AQUISITION,	aquisition	);
_declare( SHOW , 		show		);
_declare( CHECK,		check		);
_declare( KEYBOARD, 	keyboard	);

PP_IDENT pipe1;
PP_IDENT pipe2;
PP_IDENT pipe3;

	struct DATASTRUCT
	{
			UINT    WATT;
			UINT	KVAR;
			UINT	A;
			UINT	V;
	} tagDATASTRUCT;

	DATASTRUCT data;


	void print_it( UINT x, UINT y, int attr, char *string )
	{
		UINT	i;

		for( i=0; i<strlen(string); i++ )
		{
			(*screen)[y][x+i][0] = string[i];		//print a character
			(*screen)[y][x+i][1] = attr;
		}
	}



	void InitScreen( void )
	{
		UINT	i,j;

		for( i=0; i<25; i++ )
			 for( j=0; j<80; j++ )
			 {
				(*screen)[i][j][0] = ' ';
				(*screen)[i][j][1] = BLUE BACKGROUND + WHITE FOREGROUND;
			 }

		print_it( 1, 24, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, " Q - " );
		print_it( 6, 24, BLUE BACKGROUND + WHITE FOREGROUND, "Quit"  );

		print_it( 15,24, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, " G - " );
		print_it( 20,24, BLUE BACKGROUND + WHITE FOREGROUND, "Graphic (ON/OFF)"  );

		print_it( 50,24, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, " L - " );
		print_it( 55,24, BLUE BACKGROUND + WHITE FOREGROUND, "Log file view (ON/OFF)"  );

		bScreenStatus = TRUE;

	}



	BOOL	Show( DATASTRUCT datastruct )
	{
			UINT	i,j;
			DWORD	k,ncol;
			char	buffer[20];

			if( bScreenStatus == FALSE )
				InitScreen();

			if( bGraphicsStatus == ON )
			{
				for( i=0; i<NRUNITS; i++ )
				{
					for( j=1; j<=4; j++ )
					{
						if( j == 1 )
						{
							ncol = ( DWORD )( ( MAX_COL - STARTX ) * datastruct.WATT / MAX_VALUE );
							sprintf( buffer, "UNIT %d %5d KWATT", i+1, datastruct.WATT );
							print_it( 1, i*5+j, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, buffer );
						}
						if( j == 2 )
						{
							ncol = ( DWORD )( ( MAX_COL - STARTX ) * datastruct.KVAR / MAX_VALUE );
							sprintf( buffer, "%12d KVAR", datastruct.KVAR );
							print_it( 1, i*5+j, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, buffer );
						}
						if( j == 3 )
						{
							ncol = ( DWORD )( ( MAX_COL - STARTX ) * datastruct.A    / MAX_VALUE );
							sprintf( buffer, "%12d A",  datastruct.A );
							print_it( 1, i*5+j, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, buffer );
						}
						if( j == 4 )
						{
							ncol = ( DWORD )( ( MAX_COL - STARTX ) * datastruct.V    / MAX_VALUE );
							sprintf( buffer, "%12d V",  datastruct.V );
							print_it( 1, i*5+j, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, buffer );
						}


						for( k=0; k<ncol; k++ )
							(*screen)[ i*5+j ][ STARTX+k ][ 0 ] = 0x08;

					}
				}

				delay( 100 );

				for( i=0; i<NRUNITS; i++ )
				{
					for( j=1; j<=4; j++ )
					{
						ncol = ( DWORD )( ( MAX_COL - STARTX ) * MAX_VALUE / MAX_VALUE );

						for( k=0; k<ncol; k++ )
						(*screen)[ i*5+j ][ STARTX+k ][ 0 ] = ' ';
					}
				}
			}

			return TRUE;
	}



	void	ViewLogFile( void )
	{
			UINT	i;
			char	buffer[MAX_COL-1];
			char	clear_message[MAX_COL-1];
			char	ch = 0;


			for( i=0; i<MAX_COL-1; i++ )
				 clear_message[i] = ' ';

			if( bViewLogFile == ON )
			{
				bGraphicsStatus = OFF;

				/* move to the beginning of the file */
				fseek( file, 0, SEEK_SET );

				while( !feof( file ) && ch != 27 )
				{
					for( i=1; i<20; i++ )
					{
						fgets( buffer, MAX_COL, file );
						print_it( 1, i, BLUE BACKGROUND + WHITE FOREGROUND, clear_message );
						print_it( 1, i, BLUE BACKGROUND + WHITE FOREGROUND, buffer );
					}

					ch = _getch();
					switch( ch )
					{
						case	27	: 	break;
						default		:	break;
					}
				}

				InitScreen();
				bGraphicsStatus = ON;
				bViewLogFile = !bViewLogFile;
			}

	}



TASK aquisition(void)
{
 while(1)
 {
	data.WATT	=	random( MAX_VALUE );
	data.KVAR	=   random( MAX_VALUE );
	data.V		=	random( MAX_VALUE );
	data.A		=	random( MAX_VALUE );

	_p_send( pipe1, data );
 }
}


TASK check( void )
{
	UINT		i;
	DATASTRUCT	dataTemp;
	char		buffer[MAX_COL-1];
	char		clear_message[MAX_COL-1];

	while( 1 )
	{
		_p_receive( pipe1, dataTemp );

		for( i=0; i<MAX_COL-1; i++ )
			 clear_message[i] = ' ';


		if( file == NULL )
			file = fopen( "baza.dat", "r+" );


		if( dataTemp.WATT	> 	MAX_VALUE-MAX_VALUE*5/100 )
		{
			sprintf( buffer, "%s%s%5d\n", messageWATTHIGH, messageCURRVAL, dataTemp.WATT );
			print_it( 1, 22, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, clear_message );
			print_it( 1, 22, BLUE BACKGROUND + RED   FOREGROUND + BRIGHT, buffer );
			fseek( file, 0, SEEK_END );
			fwrite( buffer, strlen(buffer), 1, file );
		}

		if( dataTemp.KVAR	> 	MAX_VALUE-MAX_VALUE*5/100 )
		{
			sprintf( buffer, "%s%s%5d\n", messageKVARHIGH, messageCURRVAL, dataTemp.KVAR );
			print_it( 1, 22, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, buffer );
			print_it( 1, 22, BLUE BACKGROUND + RED   FOREGROUND + BRIGHT, buffer );
			fseek( file, 0, SEEK_END );
			fwrite( buffer, strlen(buffer), 1, file );
		}

		if( dataTemp.A		> 	MAX_VALUE-MAX_VALUE*5/100 )
		{
			sprintf( buffer, "%s%s%5d\n", messageAHIGH, messageCURRVAL, dataTemp.A );
			print_it( 1, 22, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, clear_message );
			print_it( 1, 22, BLUE BACKGROUND + RED	 FOREGROUND + BRIGHT, buffer );
			fseek( file, 0, SEEK_END );
			fwrite( buffer, strlen(buffer), 1, file );
		}

		if( dataTemp.V		> 	MAX_VALUE-MAX_VALUE*5/100 )
		{
			sprintf( buffer, "%s%s%5d\n", messageVHIGH, messageCURRVAL, dataTemp.V );
			print_it( 1, 22, BLUE BACKGROUND + WHITE FOREGROUND + BRIGHT, clear_message );
			print_it( 1, 22, BLUE BACKGROUND + RED   FOREGROUND + BRIGHT, buffer );
			fseek( file, 0, SEEK_END );
			fwrite( buffer, strlen(buffer), 1, file );
		}

		_p_send( pipe2, dataTemp );
	}
}



TASK show(void)
{
 DATASTRUCT		dataTemp;

 while(1)
 {
   _p_receive( 	pipe2, dataTemp );

   Show( dataTemp );
   ViewLogFile();

   _p_send( 	pipe3, dataTemp );

 }
}



TASK	keyboard( void )
{
	char		ch;
	DATASTRUCT	dataTemp;


   while( 1 )
   {
		_p_receive( pipe3, dataTemp );

		if( kbhit() )
		{
			ch = _getch();
			ch = toupper( ch );
			switch( ch )
			{
				case	'Q'	:   if( file != NULL )	fclose( file );
								_endmt();
								break;
				case	'G'	:	bGraphicsStatus = !bGraphicsStatus;
								break;
				case	'L'	:	bViewLogFile = !bViewLogFile;
								break;
				default		:	break;
			}
		}
   }
}




void main(void)
{
	screen = (screen_type far*)(  MK_FP( 0xB800, 0x0000 ) );

 _execute{
   _create( AQUISITION, aquisition, 	1, 8, AQUISITION	);
   _create( SHOW, 		show,		 	1, 8, SHOW			);
   _create( CHECK, 		check,		 	1, 8, CHECK			);
   _create( KEYBOARD, 	keyboard,		1, 8, KEYBOARD		);

   _p_create( pipe1, AQUISITION,	CHECK 		);
   _p_create( pipe2, CHECK,			SHOW		);
   _p_create( pipe3, SHOW, 			KEYBOARD	);

   _activate( AQUISITION	);
   _activate( CHECK			);
   _activate( SHOW			);
   _activate( KEYBOARD		);

   _run(54000L);
   _exit();
 }
}

