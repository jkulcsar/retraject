
	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef _COLORS_H
	#include "colors.h"
	#endif

	#ifndef __STDDEF_H
	#include <stddef.h>
	#endif

	#ifndef __DOS_H
	#include <dos.h>
	#endif


	#ifndef __IOSTREAM_H
	#include <iostream.h>
	#endif

	#ifndef __IOMANIP_H
	#include <iomanip.h>
	#endif


	#ifndef	_ROBOT_H
	#include "robot.h"
	#endif

	#ifdef __cplusplus
		#define __CPPARGS ...
	#else
		#define __CPPARGS
	#endif

	#define INTR 	0x08    /* The clock interrupt */
	#define MAXINT	0xFFFF




	void interrupt ( *oldhandler)( __CPPARGS );
	void interrupt handler( __CPPARGS );

	UINT*	c;			// used for countdown of TC for each joint
	UINT*	d;			// holds the current direction for each trajectory
						// (it must have a NrOfJoints*NrOfTrajectories dimension! )
						// because every particular trajectory has his own direction,
						// even in a joint
	UINT**	ppuiTCA;    // array of pointers; contains the pointers to the TC arrays
						// dimension: NrOfJoints;
	UINT*	qpd;		// quantum per division; same for every joint for trajectory i;
						// dimension: NrOfTrajectories
	UINT	cqpd;		// a counter, to count the quantums/division; it is initialized
						// to zero for every new division ( so we can keep track when
						// a new division occurs)
	UINT	JDivisions; // number of divisions for a joint (same for everyone of them)
	UINT    TDivisions; // number of divisions for a trajectory (same for everyone of them)
	UINT	uiNrOfJoints;		// number of joints (get it out from class Robot)
	UINT    uiNrOfTrajectories;	// number of trajectories (get it out from class Robot;
								// uiNrOfTrajectories = m_uiNrOfPoints-1
	UINT	uiCurrentTrajectory;
	UINT	ctdiv, cjdiv;		// current trajectory and joint division; used for counting the current position
								// in the time vector when parsing trough the joint-divisions
	BOOL	bCommandOK;

	UINT	LPT1;
	unsigned far* pLPT1;


	// the following variables are used for debugging
	// (through the video memory)
	unsigned int far *screen =  (unsigned int far*)(  MK_FP( 0xB800, 0x0000 ) );;
	BYTE col = 1;	// current column on the screen
	BYTE car = '*';





	void SetClockTo( unsigned timeout )
	{
		disable();
		outportb( 0x43, 0x34 );
		outportb( 0x40, LOBYTE(timeout) );
		outportb( 0x40, HIBYTE(timeout) );
		enable();
	}

	UINT ReadClock()
	{
		UINT	LSB, MSB, CLOCK;

		disable();
		outportb( 0x43, 0x04 );
		LSB		= inportb( 0x40 );
		MSB 	= inportb( 0x40 );
		CLOCK	= ( MSB << 8 ) + LSB;
		enable();

		return CLOCK;
	}



	BOOL	NewDivision( void )
	{
			if( cqpd >= qpd[ uiCurrentTrajectory ] )
			{
				ctdiv++;
				cjdiv++;
				if( ctdiv >= TDivisions )
				{
					ctdiv = 0;
					uiCurrentTrajectory++;
				}
				cqpd = 0;	// init counter for quantums/division
				return TRUE;
			}
			else
				return FALSE;
	}


	void interrupt handler( __CPPARGS )
	{
		UINT	i,j;
		UINT	uiTemp;
		BYTE	bCommByte;

		// init command word
		bCommByte = 0;

		if( NewDivision() == TRUE )
		{
			for( i=0; i<uiNrOfJoints; i++ )
				c[i] = (*(ppuiTCA[i] + cjdiv));
		}
		else
		{
			for( i=0; i<uiNrOfJoints; i++ )
			{
				c[i]--;
				if( c[i] <= 0 )
				{
					// formeaza impuls
					// la formarea impulsului, se refera exclusiv
					// la robotul RIP02
					bCommByte = d[ i*uiNrOfTrajectories + uiCurrentTrajectory ];

					// pentru motorul 1 (i==0) sens <<= 1
					if( i == 0 )
					{
						bCommByte <<= 1;
						bCommByte |=  1;
					}

					// pentru motorul 2 (i==1) sens <<= 2
					if( i == 1 )
					{
						bCommByte <<= 2;
						bCommByte |=  4;
					}

					// pentru motorul 3 (i==2) sens <<= 4
					if( i == 2 )
					{
						bCommByte <<= 4;
						bCommByte |=  16;
					}

					outportb( LPT1, bCommByte );
					// plus simularea prin memoria video ...
					screen[col] = WHITE FOREGROUND + BLUE BACKGROUND + car;
					if(col<79) col++;
					else
					{
						col=0;
						if( car == '*'  ) car = '|';
							else car = '*';
					}


					// o mica temporizare (?)
					uiTemp++;
					uiTemp++;
					uiTemp++;

					bCommByte = 0;
					outportb( LPT1, bCommByte );

					// reincarca c[i]
					c[i] = (*(ppuiTCA[i] + cjdiv));
				}
			}
		}

		cqpd++;		// next quantum

		oldhandler();

		if( cjdiv >= JDivisions )
			bCommandOK = TRUE;
	}



	BOOL	Robot::Command( void )
	{

			UINT	i,j;

			bCommandOK = FALSE;

		   // set up the variables for command ...
		   ppuiTCA = (UINT**)  new char[  m_uiNrOfJoints * sizeof(UINT*) ];
		   d       = (UINT*)   new UINT[ (m_uiNrOfPoints-1) * m_uiNrOfJoints ];
		   c	   = (UINT*)   new UINT[  m_uiNrOfJoints ];
		   qpd	   = (UINT*)   new UINT[  m_uiNrOfPoints-1 ];
		   pLPT1   = (unsigned far *) MK_FP( 0x0000, 0x0408 );
		   LPT1	   = *pLPT1;


		   if( (m_pJoint != NULL) && (ppuiTCA != NULL ) && (d != NULL) && (c != NULL) && (qpd != NULL) )
		   {
				uiNrOfJoints 		= m_uiNrOfJoints;
				uiNrOfTrajectories 	= m_uiNrOfPoints - 1;
				uiCurrentTrajectory = 0;
				ctdiv				= 0;    // starting trajectory division
				cjdiv				= 0;	// starting joint division
				cqpd				= 0;	// starting the up-counter for quantums/division
				JDivisions = m_pJoint[0].GetNrOfDivisions();
				TDivisions = (UINT) m_pJoint[0].GetNrOfDivisions() / uiNrOfTrajectories ;

			   for( i=0; i<m_uiNrOfJoints; i++ )
					ppuiTCA[i] = m_pJoint[i].GetPointerToTCA();

			   for( i=0; i<m_uiNrOfJoints; i++ )
					for( j=0; j<uiNrOfTrajectories; j++ )
						d[ i*uiNrOfTrajectories + j ] = m_pJoint[i].GetDirectionForTrajectory( j );

			   for( i=0; i<uiNrOfTrajectories; i++ )
					qpd[i] = m_pJoint[0].GetNQPDForTrajectory( i );

		   }
		   else
		   {
				cout<<"Out of memory in Command!";
				return FALSE;
		   }

			// save the old interrupt vector
		   oldhandler = getvect(INTR);

		   // set the new interrupt rate
		   ::SetClockTo( m_uiQuantum );

			// set the new interrupt handler
			setvect(INTR, handler);

			while( bCommandOK == FALSE )
			{
				// all we can do is sit and wait ...
			}

			// restore old interrupt rate
			::SetClockTo( 0xFFFF );

			// reset the old interrupt handler
			setvect(INTR, oldhandler);


			// deallocate memory ...
			if( ppuiTCA != NULL )	delete[] ppuiTCA;
			if( d       != NULL )	delete[] d;
			if( c       != NULL )	delete[] c;
			if( qpd	    != NULL )	delete[] qpd;

			return TRUE;
	}




	BOOL	Robot::Setup()
	{
			UINT	i;

			cout<<"\nSetting up the ROBOT.";
			cout<<"\nNumber of joints : ";		cin>>m_uiNrOfJoints;
			cout<<"\nNumber of points : ";		cin>>m_uiNrOfPoints;

			m_pJoint = (Joint*) new Joint[ m_uiNrOfJoints ];

			if( m_pJoint != NULL )
			{
				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].SetNrOfPointsTo( m_uiNrOfPoints );

				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].Setup();

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Robot::SetMaxDivisionsTo( UINT md )
	{
			UINT	i;

			if( md > 0 )
			{
				m_uiMaxDivisions = md;

				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].SetMaxDivisionsTo( md );

				return TRUE;
			}
			else
				return FALSE;
	}


	BOOL	Robot::SetQuantumTo( UINT q )
	{
			UINT	i;

			if( q > 0 )
			{
				m_uiQuantum = q;

				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].SetQuantumTo( q );

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Robot::SetUpTime( void )
	{
			// select the longest time from the array of joints
			// and from the array of trajectories inside of the joint

			UINT	i;
			UINT	j;
			float	fTime;

			if( m_pJoint != NULL )
			{
				for( i=0; i < m_uiNrOfPoints - 1; i++ )
				{
					 fTime = 0;

					 for( j=0; j < m_uiNrOfJoints; j++ )
					 {
						if ( m_pJoint[j].GetTime( i ) > fTime )
							 fTime = m_pJoint[j].GetTime( i );
					 }

					 for( j=0; j < m_uiNrOfJoints; j++ )
						   m_pJoint[j].SetTimeTo( fTime, i );
				}
				return TRUE;
			}
			else
				return FALSE;
	}


	UINT	Robot::FindOutQuantum()
	{

			UINT	i,j;
			UINT	uiStartTime, uiEndTime, uiQ;
			UINT	uiTemp;
			BYTE	bCommByte;


		   d       = (UINT*)   new UINT[ (m_uiNrOfPoints-1) * m_uiNrOfJoints ];
		   c	   = (UINT*)   new UINT[  m_uiNrOfJoints ];
		   qpd	   = (UINT*)   new UINT[  m_uiNrOfPoints-1 ];
		   pLPT1   = (unsigned far *) MK_FP( 0x0000, 0x0408 );
		   LPT1	   = *pLPT1;

		   if( (d != NULL) && (c != NULL) && (qpd != NULL) )
		   {
				uiNrOfJoints 		= m_uiNrOfJoints;
				uiNrOfTrajectories 	= m_uiNrOfPoints - 1;
				uiCurrentTrajectory = 0;
				ctdiv				= MAXINT/2;		// starting trajectory division
				cjdiv				= MAXINT/2;	// to activate the 'if' for the 'return' at the end of the dummy handler
				cqpd				= MAXINT;	// this way the 'if' in NewDivision() will allways be TRUE
				JDivisions = (UINT)( m_uiMaxDivisions * uiNrOfTrajectories );
				TDivisions = m_uiMaxDivisions ;


			   for( i=0; i<m_uiNrOfJoints; i++ )
					for( j=0; j<uiNrOfTrajectories; j++ )
						d[ i*(m_uiNrOfPoints-1) + j ] = 1;

			   for( i=0; i<uiNrOfTrajectories; i++ )
					qpd[i] = 0;

		   }
		   else
		   {
				cout<<"Out of memory in FindOutQuantum!";
				return FALSE;
		   }

			// save the old interrupt vector
			// we need it here, because it will be called in 'handler' !
		   oldhandler = getvect(INTR);


		   disable();
		   ::SetClockTo( 0xFFFF );
		   uiStartTime = ::ReadClock();

			////////////////////////////////////////////////////////////////
			// here comes the dummy handler ...
			if( NewDivision() == TRUE )
			{
				for( i=0; i<uiNrOfJoints; i++ )
				{
					// doing this four times, we simulate pretty well
					// the pointer-calculation for ppuiTCA !
					c[i] = 1;
					c[i] = 1;
					c[i] = 1;
					c[i] = 1;
				}
			}

			for( i=0; i<uiNrOfJoints; i++ )
			{
				c[i]--;
				if( c[i] == 0 )
				{
					// formeaza impuls
					// la formarea impulsului, se refera exclusiv
					// la robotul RIP02
					bCommByte = d[ i*uiNrOfTrajectories + uiCurrentTrajectory ];

					// pentru motorul 1 (i==0) sens <<= 1
					if( i == 0 )
					{
						bCommByte <<= 1;
						bCommByte |=  1;
					}

					// pentru motorul 2 (i==1) sens <<= 2
					if( i == 1 )
					{
						bCommByte <<= 2;
						bCommByte |=  4;
					}

					// pentru motorul 3 (i==2) sens <<= 4
					if( i == 2 )
					{
						bCommByte <<= 4;
						bCommByte |=  16;
					}

					bCommByte = 0;		// don't hurt anybody
					outportb( LPT1, bCommByte );

					// o mica temporizare (?)
					uiTemp++;
					uiTemp++;
					uiTemp++;

					bCommByte = 0;
					outportb( LPT1, bCommByte );

					// reincarca c[i]
					c[i] = 1;
					c[i] = 1;
					c[i] = 1;
					c[i] = 1;
				}
			}

			cqpd++;		// next quantum

			oldhandler();

			if( cjdiv >= JDivisions )
				bCommandOK = TRUE;
			///////////////////////////////////////////////////////////////

		   uiEndTime   = ::ReadClock();
		   enable();

		   uiQ         = uiStartTime - uiEndTime;

		   // deallocate memory ...
		   if( d       != NULL )	delete[] d;
		   if( c       != NULL )	delete[] c;
		   if( qpd	   != NULL )	delete[] qpd;

		   cout<<"\nQuantum is "<<setw(10)<<uiQ<<" ticks.";
		   return uiQ;
	}




	BOOL	Robot::Compute()
	{
			// you should insert some checkings on the result ...

			UINT	i;

			SetUpTime();
			SetMaxDivisionsTo( 20 );
			SetQuantumTo( FindOutQuantum() );

			if( m_pJoint != NULL )
			{
				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].Compute();

				return TRUE;
			}
			else
				return FALSE;
	}




	BOOL	Robot::Show()
	{
			UINT	i;

			if( m_pJoint != NULL )
			{
				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].Show();
				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Robot::DumpOut()
	{
			UINT	i;

			if( m_pJoint != NULL )
			{
				for( i=0; i<m_uiNrOfJoints; i++ )
					 m_pJoint[i].DumpOut();
				return TRUE;
			}
			else
				return FALSE;
	}




	Robot::Robot()
	{
		// dinamic memory allocation for pointer m_pJoint is made by
		// Setup, after it finds out the number of joints.

		m_pJoint			=	NULL;
		m_uiNrOfJoints		=	0;
		m_uiNrOfPoints		=	0;

		m_bCommandOK		=	FALSE;

		m_uiQuantum			=	0;
		m_dwFrequency		=	0;
		m_uiMaxDivisions	=	0;		// max nr of divisions per trajectory

	}


	Robot::~Robot()
	{
		if( m_pJoint != NULL )
		{
			cout<<"\nDestroying ROBOT...";

			delete[ ]  m_pJoint;

			cout<<"\nROBOT destroyed.";
		}
	}



