
	#ifndef  _TRAJECT_H
	#include "traject.h"
	#endif

	#ifndef __STDDEF_H
	#include <stddef.h>
	#endif

	#ifndef __CONIO_H
	#include <conio.h>
	#endif

	#ifndef __GRAPHICS_H
	#include <graphics.h>
	#endif

	#ifndef __IOSTREAM_H
	#include <iostream.h>
	#endif


	#ifndef _ANEXA_H
	#include "anexa.h"
	#endif


	#define MHZ 1193180

	BOOL	Trajectory::Setup( float fMS, float fMA, float fIP, float fFP )
	{

			if( (fMS != 0) && (fMA != 0) )
			{
				m_fKV	=	fMS;
				m_fKA	=	fMA;
			}
			else
			{
				m_fKV	=	1;
				m_fKA	=	1;
			}


			if( (fIP >= 0) && (fFP >= 0) )
			{
				m_fInitialPosition = fIP;
				m_fFinalPosition   = fFP;
			}
			else
			{
				m_fInitialPosition = 0;
				m_fFinalPosition   = 0;
			}


			if( D() >= 0 )
				m_uiDirection = FORWARD;
			else
				m_uiDirection = BACKWARD;

			// settings which must come from the real world ...
			SetQuantumTo( 100 );

			return TRUE;
	}



	float	Trajectory::D( void )
	{
			return ( float )( m_fFinalPosition - m_fInitialPosition );
	}


	Trajectory::Trajectory( void )
	{
			// Remember! The acceleration, position and speed arrays
			// are all of lenght 'm_uiNrOfValues'!
			// The memory amount for them will be allocated by the
			// appropriate computation functions !


			m_pfAcceleration	=	NULL;
			m_pfPosition		= 	NULL;
			m_pfSpeed			=	NULL;

			m_fTrajectoryTime	=	0;
			m_fLambda			=	1;
			m_uiNrOfValues		=	0;
			m_fInitialPosition	=	0;
			m_fFinalPosition	=	0;
			m_fKV				=	0;
			m_fKA				=	0;

			m_uiCurrentPosition     =   0;
			m_uiCurrentSpeed        =   0;
			m_uiCurrentAcceleration =   0;

			m_uiType		=	0;
			m_uiDirection	=	FORWARD;


			//	variables which help controlling the quantification
			//	of the trajectory
			m_uiQuantum			=	0;
			m_uiDivisions		=	0;
			m_uiMaxDivisions	=	0;
			m_uiNrOfValues		=	0;

	}





	Trajectory::Trajectory( Trajectory& t )
	{
			// Remember! The acceleration, position and speed arrays
			// are all of lenght 'm_uiNrOfValues'!
			// The memory amount for them will be allocated by the
			// appropriate computation functions !

			if( &t != NULL )
			{
				m_pfAcceleration	=	NULL;
				m_pfPosition		= 	NULL;
				m_pfSpeed			=	NULL;

				m_fTrajectoryTime	=	t.m_fTrajectoryTime;
				m_uiNrOfValues		=	t.m_uiNrOfValues;
				m_fInitialPosition	=	t.m_fInitialPosition;
				m_fFinalPosition	=	t.m_fFinalPosition;
				m_fKV				=	t.m_fKV;
				m_fKA				=	t.m_fKA;

				m_uiCurrentPosition     =   0;
				m_uiCurrentSpeed        =   0;
				m_uiCurrentAcceleration =   0;

			}
	}




	Trajectory::~Trajectory( void )
	{
			// Remember! The acceleration, position and speed arrays
			// are all of lenght 'm_uiNrOfValues'!

			cout<<"\nDestroying TRAJECTORY ...";

			if( m_pfAcceleration != NULL )
				delete[ ]		m_pfAcceleration;

			if( m_pfPosition != NULL )
				delete[ ]		m_pfPosition;

			if( m_pfSpeed != NULL )
				delete[ ]		m_pfSpeed;

			cout<<"\nTRAJECTORY destroyed.";

	}




	BOOL	Trajectory::m_ComputePosition( void )
	{
			// do nothing ... it will be redefined ...
			return FALSE;
	}


	BOOL	Trajectory::m_ComputeSpeed( void )
	{
			// do nothing ... it will be redefined ...
			return FALSE;
	}



	BOOL	Trajectory::m_ComputeAcceleration( void )
	{
			// do nothing ... it will be redefined ...
			return FALSE;
	}


	BOOL	Trajectory::ComputeTrajectory( void )
	{
			// in computing the trajectory we do NOT perform any computations
			// regarding the movement time. This is handled and set for
			// every trajectory by class Robot

			BOOL	bLambdaResult;
			BOOL	bDivResult;
			BOOL	bPosResult;
			BOOL	bSpdResult;
			BOOL	bAccResult;

			bLambdaResult	=	m_ComputeLambda();
			bDivResult		=	m_ComputeDivisions();
			bPosResult		=	m_ComputePosition();
			bSpdResult		=	m_ComputeSpeed();
			bAccResult		=	m_ComputeAcceleration();

			return (	bLambdaResult	&&
						bDivResult		&&
						bPosResult		&&
						bSpdResult		&&
						bAccResult  			);
	}




	float	Trajectory::m_ComputeTrajectoryTime( void )
	{
		// do nothing ... it will be redefined in derivated classes
		return 0;
	}



	BOOL	Trajectory::m_ComputeLambda( void )
	{
		// do nothing ... it will be redefined in derivated classes
		return FALSE;
	}





	float	Trajectory::m_GetMaximumOf( float* m_pfWhat )
	{
			UINT	i;
			float	result;

			result = 0;
			if( m_pfWhat != NULL )
			{
				for( i=0; i<m_uiNrOfValues; i++ )
					 if( ABS( m_pfWhat[i] ) >= result )
						 result = ABS( m_pfWhat[i] );
			}
			else return result;

			return result;
	}




	float	Trajectory::GetTime()
	{
			return (float) m_ComputeTrajectoryTime();
	}



	UINT	Trajectory::GetDirection()
	{
			return m_uiDirection;
	}



	UINT	Trajectory::GetNrOfDivisions()
	{
			return m_uiDivisions;
	}



	DWORD	Trajectory::GetStepsToExecute()
	{
			return (DWORD) (ABS(D()));
	}


	float	Trajectory::GetNextPosition()
	{
			float	result;

			if( m_uiCurrentPosition >= m_uiNrOfValues )
				m_uiCurrentPosition =  0;
			result = m_pfPosition[ m_uiCurrentPosition ];
			m_uiCurrentPosition++;

			return result;
	}


	float	Trajectory::GetInitPosition()
	{
			return m_fInitialPosition;
	}


	float	Trajectory::GetFinalPosition()
	{
			return m_fFinalPosition;
	}


	float	Trajectory::GetNextSpeed()
	{
			float	result;

			if( m_uiCurrentSpeed >= m_uiNrOfValues )
				m_uiCurrentSpeed =  0;
			result = m_pfSpeed[ m_uiCurrentSpeed ];
			m_uiCurrentSpeed++;

			return result;
	}



	BOOL	Trajectory::SetTimeTo( float t )
	{
			m_fTrajectoryTime = (float) t;
			return TRUE;
	}


	float	Trajectory::GetScaledTime( )
	{
			return (float)( m_fTrajectoryTime );
	}



	BOOL	Trajectory::SetMaxDivisionsTo( UINT	md )
	{
			if( md > 0 )
			{
				m_uiMaxDivisions = md;
				return TRUE;
			}
			else
				return FALSE;
	}




	BOOL	Trajectory::m_Plot( float* m_pfWhat, float fScalX, float fScalY )
	{

		float	step;
		float	time;
		int     iGraphX, iGraphY;
		int	iMaxY, iY0;
		int	i;

		iMaxY = ::getmaxy();
		iY0   = (int) ( iMaxY / 2 );

		if( m_pfWhat != NULL )
		{
			step = m_fTrajectoryTime / m_uiDivisions;
			time = 0;
			for( i=0; i < m_uiNrOfValues; i++ )
			{
				iGraphX = ( UINT )( time * fScalX );
				iGraphY = ( UINT )( m_pfWhat[i] * fScalY + iY0 );
				iGraphY =  iMaxY - iGraphY;
				if( i == 0 )
				{
					::moveto( iGraphX, iGraphY );
					::circle( iGraphX, iGraphY, 5 );
				}
				else
				{
					::lineto( iGraphX, iGraphY );
					::circle( iGraphX, iGraphY, 5 );
				}
				time += step;
			}
			return TRUE;
		}
		return FALSE;
	}



	BOOL	Trajectory::Show( void )
	{
			int	GraphDriver, GraphMode;
			UINT	uiMaxX, uiMaxY, uiX0, uiY0;
			float	fScalX, fScalY;
			int     ErrorCode;
			float	fMaxXValue;
			float	fMaxYValue;
			float	fMaxAcceleration;
			float	fMaxPosition;
			float	fMaxSpeed;


			::registerfarbgidriver( EGAVGA_driver_far );
			::registerfarbgifont(   small_font_far );
			GraphDriver = DETECT;
			::initgraph( &GraphDriver, &GraphMode, "" );
			ErrorCode = graphresult();
			if( ErrorCode != grOk )
			{
				cout<<("\n\nProblems at the Graphics System : %s\n", ::grapherrormsg( ErrorCode ) );
				return FALSE;
			}
			uiMaxX 	=	getmaxx();
			uiMaxY 	=	getmaxy();
			uiX0    =	uiMaxX / 2;
			uiY0	=	uiMaxY / 2;

			// first: find out the scale factors on X and Y axes
			fScalX	    =	0;
			fScalY	    =	0;
			fMaxXValue	=	0;
			fMaxYValue	=	0;

			fMaxAcceleration 	= 	m_GetMaximumOf( m_pfAcceleration );
			fMaxPosition		=	m_GetMaximumOf( m_pfPosition );
			fMaxSpeed 			= 	m_GetMaximumOf( m_pfSpeed );

			if( fMaxAcceleration >= fMaxYValue )
				fMaxYValue = fMaxAcceleration;
			if( fMaxPosition     >= fMaxYValue )
				fMaxYValue = fMaxPosition;
			if( fMaxSpeed        >= fMaxYValue )
				fMaxYValue = fMaxSpeed;

			fMaxXValue = m_fTrajectoryTime;

			fScalX = ( float ) ( uiMaxX / fMaxXValue );
			fScalY = ( float ) ( uiY0   / fMaxYValue );


			// now comes the effective plot ...
			if( m_Plot( m_pfAcceleration, fScalX, fScalY ) &&
				m_Plot( m_pfPosition, fScalX, fScalY )     &&
				m_Plot( m_pfSpeed, fScalX, fScalY )		    )
			{
				getch();
				return TRUE;
			}
			else
			{
				getch();
				return FALSE;
			}

	}




	BOOL	Trajectory::SetQuantumTo( UINT q )
	{
			if( q > 0 )
			{
				m_uiQuantum = q;
				return TRUE;
			}
			else
				return FALSE;
	}





	BOOL	Trajectory::m_ComputeDivisions( void )
	{
			if( ( m_fTrajectoryTime > 0 )  && ( m_uiQuantum > 0 ) )
			{
				m_uiDivisions = (UINT)( ( m_fTrajectoryTime*1000000L ) / (m_uiQuantum / MHZ) );

				if( m_uiDivisions > m_uiMaxDivisions )
					m_uiDivisions = m_uiMaxDivisions;

				if( m_uiDivisions <= 0 )
					m_uiDivisions = 1;

				m_uiNrOfValues = m_uiDivisions + 1;		// Why? Please read Project Notes!
				return TRUE;
			}
			else
				return FALSE;
	}





	BOOL	Trajectory::DumpOut( void )
	{
			UINT	i;

			::clrscr();

			cout<<"Trajectory Time: "<<m_ComputeTrajectoryTime();
			cout<<"\t\tLambda: "<<m_fLambda<<"\n";

                        for( i=0; i<m_uiNrOfValues; i++ )
				cout<<i<<"\t\t"<<GetNextPosition()<<"\t\t"<<GetNextSpeed()<<"\n";

			::getch();
			return TRUE;
	}
