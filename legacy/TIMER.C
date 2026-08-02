/*   TIMER.C - Timer/Counter Readings                        */
/*   ADA1100 Turbo C Software   (rev 1.0)                    */
/*                                                           */
/*   Real Time Devices, Inc.                                 */
/*   POB 906                                                 */
/*   State College, PA  16804                                */
/*   Voice: (814) 234-8087                                   */
/*   FAX:   (814) 234-5218                                   */
/*                                                           */
/*   Turbo C v2.0                   9/20/90                  */
/*                                                           */
/*   This program will demonstrate how to use the ADA1100    */
/*   timer/counter to take  a timer reading and store it     */
/*   in  an array. The timer is clocked at 5 MHz and         */
/*   will give a highly accurate indication of how long  it  */
/*   takes to store data in an array.                        */
/*                                                           */
/*   The 8254 timer is mapped as follows on the ADA1100:     */
/*            board+16 = counter 0                           */
/*            board+17 = counter 1                           */
/*            board+18 = counter 2                           */
/*            board+19 = control word                        */
/*                                                           */
/*  In this example we are using only counter 0 on the 8254  */
/*  chip. Please refer to the 8254 documentation for other   */
/*  operating modes.                                         */

#include <dos.h>
#include <conio.h>
#include <stdio.h>

main()
{
	int a, i, msb, lsb, board;
	int timer[200];
	board=576;
	clrscr();
	delay(1);
	printf("ADA1100 Turbo C Timer Data Collection Program: \n");
	printf("Enter ADA1100 Base I/O Address (Decimal): ");
	scanf("%d",&board);

/*  Set up counter 0 for mode 1 operation - 1 tick = .2 uS   */
/*  and 16-bit operation. Control word = 48                  */

	outportb(board+19,48);
	outportb(board+16,0);
	outportb(board+16,0);


/*  Acquire 200 timer readings in array 'timer' & shut off   */
/*  the hardware interrupts.                                 */

	disable();
	for (i=0; i<200; i++)
		{
		outportb(board+19,0);
		lsb = inportb(board+16);
		msb = inportb(board+16);
		timer[i] = (msb*256)+lsb;
		}
		printf("\n");
		enable();
	for (i=0; i<200; i++)
		{
		printf("%7u   ",timer[i]);
		delay(50);
		}
}
