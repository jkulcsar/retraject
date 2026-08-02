
		#ifndef _SPLINE_H
		#include "spline.h"
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




		float	Spline::RPos( float t )
		{
			float	result;
			float	fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 10 * pow( fNorma, 3) -    \
								15 * pow( fNorma, 4) +    \
								6  * pow( fNorma, 5)      );

			return result;
		}



		float	Spline::RSpd( float t )
		{
			float	result;
			float   fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 30 * (    pow( fNorma, 2 ) - \
									   2* pow( fNorma, 3 ) + \
										  pow( fNorma, 4 )   ) / m_fTrajectoryTime );

			return result;
		}



		float	Spline::RAcc( float t )
		{
			float result;
			float	fNorma;

			fNorma = t / m_fTrajectoryTime;
			result = ( float )( 60 * ( fNorma 				 - \
									   3 * pow( fNorma, 2 )  + \
									   2 * pow( fNorma, 3 )    ) / pow( m_fTrajectoryTime,2 ) );

			return result;
		}



		float	Spline::m_ComputeTrajectoryTime( void )
		{
				float	temp1, temp2;
				float	result;

				temp1 = ( float )( ( 15*ABS( D() ) )   / ( 8*m_fKV ) );
				temp2 = ( float )( sqrt( 10*ABS( D() )  / ( sqrt(3)*m_fKA ) ) );

				if( temp1 >= temp2 )
					result = temp1;
				else
					result = temp2;

				if( result >= 0 )
					return result;
				else
					return 0;
		}



		BOOL	Spline::m_ComputeLambda( void )
		{
				// m_fTrajectoryTime must be found out by the Robot !

				if( m_fTrajectoryTime > 0 )
				{
					m_fLambda = (float) pow( (m_ComputeTrajectoryTime() / m_fTrajectoryTime), 2 );

					// reducing maximum acceleration by the factor m_fLambda
					m_fKA     = (float) m_fKA * m_fLambda;

					return TRUE;
				}
				else
					return FALSE;
		}



	BOOL	Spline::m_ComputePosition( void )
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



	BOOL	Spline::m_ComputeSpeed( void )
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




	BOOL	Spline::m_ComputeAcceleration( void )
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




		Spline::Spline(  void )
		{
			// do nothing ...
		}


		Spline::~Spline( void )
		{
			// do nothing ...
		}
