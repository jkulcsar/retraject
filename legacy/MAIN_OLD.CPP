

	#ifndef _ROBOT_H
	#include "robot.h"
	#endif

	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef __IOSTREAM_H
	#include <iostream.h>
	#endif

	#ifndef __GRAPHICS_H
	#include <graphics.h>
	#endif

	unsigned _stklen = 16384;	// stack size set to 16kbytes



	void main()
	{
		char	cOption;

		Robot*	pRobot = NULL;

		pRobot = new Robot;

		if( pRobot != NULL )
		{
			pRobot->Setup();
			pRobot->Compute();
			pRobot->Show();
			::closegraph();
			pRobot->DumpOut();
			cout<<"\nCommand robot (y/n) ?";	cin>>cOption;
			if( cOption == 'y' )
				pRobot->Command();
		}

		if( pRobot != NULL )	delete pRobot;
	}
