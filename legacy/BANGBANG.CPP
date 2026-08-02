
		#ifndef _BANGBANG_H
		#include "bangbang.h"
		#endif

		#ifndef _JOINTYP_H
		#include "jointyp.h"
		#endif

		#ifndef __IOSTREAM_H
		#include <iostream.h>
		#endif

		#ifndef  __MATH_H
		#include <math.h>
		#endif

		#ifndef _ANEXA_H
		#include "anexa.h"
		#endif



		float	BangBang::RPos( float t )
		{
			float	result;
			float	fNorma;

			fNorma = (float)( t / m_fTrajectoryTime );

			if( (t >= 0) && (t <= m_fTrajectoryTime/2) )
				result = ( float )( 2*pow( fNorma, 2 ) );

			if( (t > m_fTrajectoryTime/2) )
				result = (float)( -1 + 4 * fNorma - 2 * pow(fNorma,2) );

			return result;
		}



		float	BangBang::RSpd( float t )
		{
			float result;
			float	fNorma;

			fNorma = (float)( t / m_fTrajectoryTime );

			if( (t >= 0) && (t <= m_fTrajectoryTime/2) )
				result = ( float )( 4 * fNorma / m_fTrajectoryTime );

			if( (t > m_fTrajectoryTime/2) )
				result = (float)( 4 * ( 1 - fNorma ) * ( 1 / m_fTrajectoryTime ) );


			return result;
		}



		float	BangBang::RAcc( float t )
		{
			float	result;


			if( (t >= 0) && (t <= m_fTrajectoryTime/2) )
				result = ( float )(  4 / pow( m_fTrajectoryTime, 2 ) );

			if( (t > m_fTrajectoryTime/2)  )
				result = ( float )( -4 / pow( m_fTrajectoryTime, 2 ) );


			return result;
		}



		float	BangBang::m_ComputeTrajectoryTime( void )
		{
				float	temp1;
				float	temp2;
				float	result;

				temp1	=	(float) ( ( 2*ABS(D()) ) / m_fKV );
				temp2	= 	(float) ( 2* sqrt( ABS(D()) / m_fKA ) );

				if( temp1 >= temp2 )
					result = temp1;
				else
					result = temp2;

				if( result >= 0 )
					return result;
				else
					return 0;
		}



		BOOL	BangBang::m_ComputeLambda( void )
		{
				// m_fTrajectoryTime must be found out by the Robot !

				if( m_fTrajectoryTime > 0 )
				{
					m_fLambda = (float) pow( (m_ComputeTrajectoryTime() / m_fTrajectoryTime), 2 );

					// reducing maximum acceleration by the factor m_fLambda
					m_fKA	  = (float) ( m_fKA * m_fLambda );

					return TRUE;
				}
				else
					return FALSE;
		}



	BOOL	BangBang::m_ComputePosition( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array

			if( m_uiNrOfValues > 0 )
				m_pfPosition = (float*) new float[ m_uiNrOfValues ];

			if( m_pfPosition != NULL )
			{
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					m_pfPosition[i] = (float)( m_fInitialPosition + RPos( time ) * D() );
					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;
	}




	BOOL	BangBang::m_ComputeSpeed( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array

			if( m_uiNrOfValues > 0 )
				m_pfSpeed = (float*) new float[ m_uiNrOfValues ];

			if( m_pfSpeed != NULL )
			{
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					m_pfSpeed[i] = (float)( RSpd( time ) * D() );
					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;

	}



	BOOL	BangBang::m_ComputeAcceleration( void )
	{
			float	time;		// counter for current time
			float	step;		// stepping through the total time;
			UINT	i;			// counter for array

			if( m_uiNrOfValues > 0 )
				m_pfAcceleration = (float*) new float[ m_uiNrOfValues ];

			if( m_pfAcceleration != NULL )
			{
				step = m_fTrajectoryTime / m_uiDivisions;
				time = 0;
				for( i=0; i<m_uiNrOfValues; i++ )
				{
					m_pfAcceleration[i] = (float)( RAcc( time ) * D() );
					time += step;
				}
				return TRUE;
			}
			else
				return FALSE;

	}



		BangBang::BangBang(  void )
		{
			m_uiType = BANGBANG;
		}


		BangBang::~BangBang( void )
		{
			// do nothing ...
		}
