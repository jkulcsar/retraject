

	#ifndef _ROBOT_H
	#include "robot.h"
	#endif

	#ifndef XVIEWH
	#include "xview.h"
	#endif

	#ifndef NOTICEH
	#include "notice.h"
	#endif


	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif


	#include <graphics.h>
	#include <conio.h>
	#include <stdio.h>

	#ifndef __IOSTREAM_H
	#include <iostream.h>
	#endif




	#define PWIDTH 32
	#define PHEIGHT 32

	char	buf[200];
	int		counter = 0;

		// the one and only Robot ...
		Robot* pRobot;


		// global variables, to store (temporarily) setup values ...
		UINT	uiNrOfJoints 		= 0;
		UINT	uiNrOfPoints 		= 0;
		float*	pfMaxSpeed   		= NULL;
		float*	pfMaxAcceleration	= NULL;
		float** ppfPoint			= NULL;

		UINT	cCurrJoint			= 1;



BOOL	Compute();
BOOL	Setup();
BOOL	InitGraphics();
void    DestroyAll();
void	TEST( void* );


/* Declaration of the interface objects */
Xv_opaque 	menu1;
Xv_opaque 	frame1, tty1;
Xv_opaque 	frame2, canvas2;
Xv_opaque	frame3, text30, text31, button3OK, button3Cancel, buttonJoints;
Xv_opaque 	frame4, button4OK, text41, text42, setting4, button4Cancel;
Xv_opaque	frame5, text51, button5OK;

void Options(Xv_opaque obj)
{
  switch (obj->v.smenu.sel_menu)
  {
		case 1: close_window(frame1);			break;
		case 2: close_window(frame2);			break;
		case 3: open_window(frame1);			break;
		case 4: open_window(frame2);			break;
		case 5: Setup();						break;
		case 6: Compute();						break;
		case 7: xv_end=notice("Exit to DOS?");	break;
  }
}




void EnterNrOfJoints(Xv_opaque obj)
{
	UINT i;

  uiNrOfJoints = obj->v.stextfield.panel_int;
  sprintf(buf,"\tNumber of joints : %d\r\n",obj->v.stextfield.panel_int);
  ttysw_output(tty1,buf);

  if( xv_ok=notice("This will destroy all !") )
  {
	  DestroyAll();
	  if( (uiNrOfJoints > 0) && (uiNrOfPoints > 0) )
	  {
			// allocate memory ...
			if( pfMaxAcceleration == NULL ) pfMaxAcceleration = (float*)  new float[ uiNrOfJoints ];
			TEST( (void*)(pfMaxAcceleration) );
			if( pfMaxSpeed == NULL ) 	pfMaxSpeed = (float*)  new float[ uiNrOfJoints ];
			TEST( (void*)(pfMaxSpeed) );
			if( ppfPoint == NULL ) 		ppfPoint = (float**) new char[ sizeof(float*) * uiNrOfJoints ];
			TEST( (void*)(ppfPoint) );
			for( i=0; i<uiNrOfJoints; i++ )
			 {
				ppfPoint[i] = (float*)  new float[ uiNrOfPoints ];
				TEST( (void*)(ppfPoint[i]) );
			 }
	  }
  }
}


void EnterNrOfPoints(Xv_opaque obj)
{
  UINT	i;

  uiNrOfPoints = obj->v.stextfield.panel_int;
  sprintf(buf,"\tNumber of points : %d\r\n",obj->v.stextfield.panel_int);
  ttysw_output(tty1,buf);

  if( xv_ok=notice("This will destroy all !") )
  {
	  DestroyAll();
	  if( (uiNrOfPoints > 0) && (uiNrOfJoints > 0 ) )
	  {
			// allocate memory ...
			if( pfMaxAcceleration == NULL ) pfMaxAcceleration = (float*)  new float[ uiNrOfJoints ];
			TEST( (void*)(pfMaxAcceleration) );
			if( pfMaxSpeed == NULL ) 	pfMaxSpeed = (float*)  new float[ uiNrOfJoints ];
			TEST( (void*)(pfMaxSpeed) );
			if( ppfPoint == NULL ) 		ppfPoint = (float**) new char[ sizeof(float*) * uiNrOfJoints ];
			TEST( (void*)(ppfPoint) );
			for( i=0; i<uiNrOfJoints; i++ )
			 {
				ppfPoint[i] = (float*)  new float[ uiNrOfPoints ];
				TEST( (void*)(ppfPoint[i]) );
			 }
	  }
  }
 }


void EnterNumber(Xv_opaque obj)
{
  /* Notify handler for text1 */
  sprintf(buf,"Integer: %d\r\n",obj->v.stextfield.panel_int);
  ttysw_output(tty1,buf);
  counter--;
  if( counter <= 0 )
	  close_window( frame3 );
}



void EnterAcceleration(Xv_opaque obj)
{
  sprintf(buf,"Maximum acceleration is %10.5f for joint %d .\r\n", obj->v.stextfield.panel_real, cCurrJoint+1 );
  pfMaxAcceleration[ cCurrJoint ] = obj->v.stextfield.panel_real;
  ttysw_output(tty1,buf);
}



void EnterSpeed(Xv_opaque obj)
{
  sprintf(buf,"Maximum speed is %10.5f for joint %d .\r\n", obj->v.stextfield.panel_real, cCurrJoint+1 );
  pfMaxSpeed[ cCurrJoint ] = obj->v.stextfield.panel_real;
  ttysw_output(tty1,buf);

}


void EnterCurrJoint( Xv_opaque obj )
{
	cCurrJoint = obj->v.stextfield.panel_int - 1;

	if( (cCurrJoint > uiNrOfJoints) )
		cCurrJoint = 0;
	sprintf( buf,"Joint to modify is %d .\r\n", cCurrJoint+1 );
	ttysw_output(tty1,buf);
}



void CloseGraphic(Xv_opaque obj)
{
  sprintf(buf,"Closed %s\r\n",obj->xv_label);
  ttysw_output(tty1,buf);
}



void ReDraw(Xv_opaque obj)
{
}



void ChangeType(Xv_opaque obj)
{
}

void Draw(Xv_opaque obj)
{
}



 BOOL	InitGraphics()
 {
		int		GraphDriver, GraphMode;
		int     ErrorCode;


		::registerfarbgidriver( EGAVGA_driver_far 	);
		::registerfarbgifont(   small_font_far		);
		GraphDriver = DETECT;
		::initgraph( &GraphDriver, &GraphMode, ""	);
		ErrorCode = graphresult();
		if( ErrorCode != grOk )
		{
			cout<<("\n\nProblems at the Graphics System : %s\n", ::grapherrormsg( ErrorCode ) );
			return FALSE;
		}
		else
			return TRUE;
 }


 BOOL	Compute()
 {
		return FALSE;
 }




 void SetupOK(Xv_opaque obj)
 {
	if( xv_ok=notice("   Setup ready ?   ") )
		close_window( frame4 );
 }


 void SetupCancel(Xv_opaque obj)
 {
	close_window( frame3 );
 }



 void JointOK(Xv_opaque obj)
 {
	if( xv_ok=notice(" Joint setup ready ? ") )
		close_window( frame4 );
 }



 void CurrJointOK(Xv_opaque obj)
 {
	if( xv_ok=notice(" Joint index correct ? ") )
	{
		close_window( frame5 );
		open_window( frame4 );
	}
 }



 void JointCancel(Xv_opaque obj)
 {
	close_window( frame4 );
 }


 void TEST( void* p )
 {
		if( p == NULL )
		{
			sprintf(buf,"There is not enough memory ! r\n");
			ttysw_output(tty1,buf);
		}
 }



 void SetupJoint(Xv_opaque obj)
 {
	UINT	i, j;

	if( (uiNrOfJoints > 0) && (uiNrOfPoints > 0) )
	{
		// allocate memory ...
		if( pfMaxAcceleration == NULL ) pfMaxAcceleration = (float*)  new float[ uiNrOfJoints ];
		TEST( (void*)(pfMaxAcceleration) );
		if( pfMaxSpeed == NULL ) 	pfMaxSpeed = (float*)  new float[ uiNrOfJoints ];
		TEST( (void*)(pfMaxSpeed) );
		if( ppfPoint == NULL ) 		ppfPoint = (float**) new char[ sizeof(float*) * uiNrOfJoints ];
		TEST( (void*)(ppfPoint) );
		for( i=0; i<uiNrOfJoints; i++ )
			 {
				ppfPoint[i] = (float*)  new float[ uiNrOfPoints ];
				TEST( (void*)(ppfPoint[i]) );
			 }

		open_window( frame5 );

		// here:  allocate memory for pRobot
		// here:  call pRobot->Setup( uiNrOfPoints, uiNrOfJoints, pfMaxSpeed, pfMaxAcceleration, ppfPoint );
	}
 }


 BOOL	Setup()
 {
		DestroyAll();
		open_window( frame3 );

		sprintf( buf, "Initiating robot setup sequence ... \r\n" );
		ttysw_output( tty1, buf );

		return TRUE;

 }





 void 	DestroyAll( )
 {
  if(pfMaxAcceleration != NULL)
  {
		delete[] pfMaxAcceleration;
		pfMaxAcceleration = NULL;
  }

  if(pfMaxSpeed != NULL)
  {
		delete[] pfMaxSpeed;
		pfMaxSpeed = NULL;
  }

  if(ppfPoint  != NULL)
  {
		for( UINT i=0; i<uiNrOfJoints; i++ )
		{
			if( ppfPoint[i] != NULL )
				delete[] ppfPoint[i];
		}
		delete[] ppfPoint;
		ppfPoint = NULL;
  }

  if( pRobot != NULL )
  {
	  delete pRobot;
	  pRobot = NULL;
  }
 }



void main()
{

  if( InitGraphics() )
  {
		use_palette=1;
		xv_init(0,0);

		menu1=xv_create(menu);
			strcpy(menu1->xv_label,"Main menu");
			item_create("Close frame");
			item_create("Close graphic window");
			item_create("Open  frame");
			item_create("Open  graphic window");
			item_create("Setup robot ...");
			item_create("Compute robot ...");
			item_create("Quit");
			menu1->v.smenu.sel_menu=1;
			menu1->notify_handler=(xv_handler)Options;


		/* Interface objects creation */
		frame1=xv_create(frame);
			strcpy(frame1->xv_label,"Robot modelling    v1.0");
			frame1->dx=getmaxx() / 2;
			frame1->dy=100;
			frame1->v.sframe.dxmin=200;
			frame1->v.sframe.dymin=100;
			frame1->menu_name=menu1;
			frame1->v.sframe.adjust_exit=0;
		tty1=xv_create(tty);
			tty1->v.scanvas.can_yext=1;


		frame2=xv_create(frame);
			strcpy(frame2->xv_label,"Graphic window");
			frame2->x=18;
			frame2->y=20;
			frame2->dx=PWIDTH*5+1+2*mrgx;
			frame2->dy=PHEIGHT*5+16+mrgx+mrgy;
			frame2->notify_handler=(xv_handler)CloseGraphic;
			frame2->menu_name=menu1;
			frame2->v.sframe.dxmin=PWIDTH+1+2*mrgx;
			frame2->v.sframe.dymin=PWIDTH+16+mrgx+mrgy;
		canvas2=xv_create(canvas);
			canvas2->y=15;
			canvas2->event_handler=(xv_handler)Draw;
			canvas2->notify_handler=(xv_handler)ReDraw;
			canvas2->menu_name=menu1;



		frame3=xv_create(frame);
			strcpy(frame3->xv_label,"Setup robot");
			frame3->x	= 	0;
			frame3->y	=	getmaxy()/2-100;
			frame3->dx	=	getmaxx()/2;
			frame3->dy	=	getmaxy()/2 - 100;
			frame3->v.sframe.dxmin=100;
			frame3->v.sframe.dymin=100;
			frame3->menu_name=menu1;
		text30=xv_create(textfield);
			strcpy(text30->xv_label," Number of joints ");
			text30->y	=	10;
			text30->v.stextfield.value_length=17;
			text30->v.stextfield.field_type=int_field;
			text30->notify_handler=(xv_handler)EnterNrOfJoints;
		text31=xv_create(textfield);
			strcpy(text31->xv_label," Number of points ");
			text31->y	=	30;
			text31->v.stextfield.value_length=17;
			text31->v.stextfield.field_type=int_field;
			text31->notify_handler=(xv_handler)EnterNrOfPoints;
		buttonJoints=xv_create(button);
			strcpy(buttonJoints->xv_label," Setup joint... ");
			buttonJoints->y=70;
			buttonJoints->notify_handler=(xv_handler)SetupJoint;
		button3Cancel=xv_create(button);
			strcpy(button3Cancel->xv_label," Cancel ");
			button3Cancel->y=90;
			button3Cancel->notify_handler=(xv_handler)SetupCancel;



		frame4=xv_create(frame);
			strcpy(frame4->xv_label,"Setup joint");
			frame4->x	= 	0;
			frame4->y	=	getmaxy()-190;
			frame4->dx	=	getmaxx()-100;
			frame4->dy	=	150;
			frame4->v.sframe.dxmin=100;
			frame4->v.sframe.dymin=100;
			frame4->menu_name=menu1;
		text41=xv_create(textfield);
			strcpy(text41->xv_label," Acceleration ");
			text41->y	=	20;
			text41->v.stextfield.value_length=10;
			text41->v.stextfield.field_type=real_field;
			text41->notify_handler=(xv_handler)EnterAcceleration;
		text42=xv_create(textfield);
			strcpy(text42->xv_label,"        Speed ");
			text42->y	=	40;
			text42->v.stextfield.value_length=10;
			text42->v.stextfield.field_type=real_field;
			text42->notify_handler=(xv_handler)EnterSpeed;
		setting4=xv_create(setting);
			strcpy(setting4->xv_label," Trajectory type ");
			item_create(" Linear ");
			item_create(" Third  ");
			item_create(" Fifth  ");
			item_create(" Bang   ");
			item_create(" Trapez ");
			setting4->y = 90;
			setting4->v.ssetting.exclusive=1;
			setting4->v.ssetting.sel_setting=1;
			setting4->notify_handler=(xv_handler)ChangeType;
		button4OK=xv_create(button);
			strcpy(button4OK->xv_label," OK ");
			button4OK->y=20;
			button4OK->x=400;
			button4OK->notify_handler=(xv_handler)JointOK;
		button4Cancel=xv_create(button);
			strcpy(button4Cancel->xv_label," Cancel ");
			button4Cancel->x=400;
			button4Cancel->y=40;
			button4Cancel->notify_handler=(xv_handler)JointCancel;



		frame5=xv_create(frame);
			strcpy(frame5->xv_label,"Joint to modify" );
			frame5->x	= 	getmaxx()/2 + 10;
			frame5->y	=	getmaxy()/2 + 10;
			frame5->dx	=	200;
			frame5->dy	=	100;
			frame5->v.sframe.dxmin=80;
			frame5->v.sframe.dymin=80;
		text51=xv_create(textfield);
			strcpy(text51->xv_label," Index ");
			text51->y	=	20;
			text51->v.stextfield.value_length=3;
			text51->v.stextfield.field_type=int_field;
			text51->notify_handler=(xv_handler)EnterCurrJoint;
		button5OK=xv_create(button);
			strcpy(button5OK->xv_label," OK ");
			button5OK->y=50;
			button5OK->notify_handler=(xv_handler)CurrJointOK;



		xv_main_loop(frame1);
		restorecrtmode();
  }

  // overall cleanup ...
  DestroyAll();

}
