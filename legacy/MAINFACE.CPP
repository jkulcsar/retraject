

	#ifndef  _TRAJECT_H
	#include "traject.h"
	#endif

	#ifndef _ROBOT_H
	#include "robot.h"
	#endif


	#ifndef _LINEAR_H
	#include "linear.h"
	#endif

	#ifndef _THIRD_H
	#include "third.h"
	#endif


	#ifndef _FIFTH_H
	#include "fifth.h"
	#endif

	#ifndef _BANGBANG_H
	#include "bangbang.h"
	#endif


	#ifndef XVIEWH
	#include "xview.h"
	#endif

	#ifndef NOTICEH
	#include "notice.h"
	#endif

	#include <graphics.h>
	#include <conio.h>
	#include <stdio.h>

	unsigned _stklen = 16384;	// stack size set to 16kbytes



#define PWIDTH 32
#define PHEIGHT 32

char	buf[200];


/* Declaration of the interface objects */
Xv_opaque 	menu1;
Xv_opaque 	frame1, tty1, text3;
Xv_opaque 	frame2, canvas1;




void Options(Xv_opaque obj)
{
  /* Notify handler for menu1 */
  switch (obj->v.smenu.sel_menu) {
    case 1: close_window(frame1); break;
    case 2: close_window(frame2); break;
    case 3: open_window(frame1); break;
    case 4: open_window(frame2); break;
    case 5: xv_end=notice("Exit to DOS?"); break;
  }
}



void EnterInt(Xv_opaque obj)
{
  /* Notify handler for text3 */
  sprintf(buf,"Integer: %d\r\n",obj->v.stextfield.panel_int);
  ttysw_output(tty1,buf);
}


void CloseGraphic(Xv_opaque obj)
{
  /* Notify handler for frame2 and frame3 */
  sprintf(buf,"Closed %s\r\n",obj->xv_label);
  ttysw_output(tty1,buf);
}



void ReDraw(Xv_opaque obj)
{
  /* Notify handler for canvas1 */
}

void Draw(Xv_opaque obj)
{
  /* Event handler for canvas1 */
}



void main()
{

  Robot*	pRobot;

  pRobot = (Robot*) new Robot;


  /* Initializing... */
  use_palette=1;
  xv_init(0,0);


  menu1=xv_create(menu);
	strcpy(menu1->xv_label,"Options");
	item_create("close frame");
	item_create("close graphic window");
	item_create("open  frame");
	item_create("open  graphic window");
	item_create("quit");
	menu1->v.smenu.sel_menu=1;
	menu1->notify_handler=(xv_handler)Options;


  /* Interface objects creation */
  frame1=xv_create(frame);
	strcpy(frame1->xv_label,"XView-PC test program");
	frame1->dx=218;
	frame1->dy=162;
	frame1->v.sframe.dxmin=218;
	frame1->v.sframe.dymin=162;
	frame1->menu_name=menu1;
	frame1->v.sframe.adjust_exit=0;
  tty1=xv_create(tty);
	tty1->v.scanvas.can_yext=0; tty1->dy=42;
  text3=xv_create(textfield);
	strcpy(text3->xv_label,"Integer:");
	text3->y=106;
	text3->v.stextfield.value_length=17;
	text3->v.stextfield.field_type=int_field;
	text3->notify_handler=(xv_handler)EnterInt;



  frame2=xv_create(frame);
	strcpy(frame2->xv_label,"Window 2");
	frame2->x=18;
	frame2->y=20;
	frame2->dx=PWIDTH*5+1+2*mrgx;
	frame2->dy=PHEIGHT*5+16+mrgx+mrgy;
	frame2->notify_handler=(xv_handler)CloseGraphic;
	frame2->menu_name=menu1;
	frame2->v.sframe.dxmin=PWIDTH+1+2*mrgx;
	frame2->v.sframe.dymin=PWIDTH+16+mrgx+mrgy;
  canvas1=xv_create(canvas);
	canvas1->y=15;
	canvas1->event_handler=(xv_handler)Draw;
	canvas1->notify_handler=(xv_handler)ReDraw;
	canvas1->menu_name=menu1;


  xv_main_loop(frame1);
  /* Exit */
  restorecrtmode();

  delete pRobot;
}
